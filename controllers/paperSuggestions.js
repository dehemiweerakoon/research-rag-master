const superbase = require('../config/postgres');
const { PDFParse } = require("pdf-parse");
const { generateEmbedding } = require("../services/embeddingService");
const { RecursiveCharacterTextSplitter } = require("@langchain/textsplitters");
const { GoogleGenAI } = require("@google/genai");
const { extractSections, identifyHeading } = require("../services/sectionService");
const {extractPaperTitle} = require("../services/getTitleService");

const saveResearchPapers = async (req, res) => {

    try {
        const file = req.file;
        if (!file) {
            return res.status(400).json({
                message: "PDF file is required"
            });
        }

        const fileName = `${Date.now()}-${file.originalname}`;

        // upload pdf to superbase storage
        const { data: storageData, error: storageError } = await superbase.
            storage.from('research-papers')
            .upload(fileName, file.buffer, {
                contentType: "application/pdf",
                upsert: false
            })

        if (storageError) {
            console.error("SUPABASE STORAGE ERROR:", storageError);

            return res.status(500).json({
                message: "Storage error occurred",
                error: storageError.message,
                details: storageError
            });
        }
        const fullText = await extractPdfText(file.buffer);

        const title = await extractPaperTitle(fullText);

        // save info in the database
        const { data: paper, error: databaseError } = await superbase.from('research_papers')
            .insert({
                file_name: file.originalname,
                file_path: storageData.path,
                title:title
            }).select().single();

        if (databaseError) {
            console.log(databaseError)
            return res.status(500).json({
                message: "Storage error occurred",
                error: databaseError,
                details: databaseError
            });
        }

        const sections = extractSections(fullText);

        console.log("Detected sections:", sections.map(section => ({
            section_title: section.section_title,
            contentLength: section.content.length
        })));

        if (!fullText.trim()) {
            return res.status(400).json({ message: "could not extract text from PDF" });
        }

        const splitter = new RecursiveCharacterTextSplitter({
            chunkSize: 1000,
            chunkOverlap: 200
        });

        const chunks = [];
        let i = 0;

        for (const section of sections) {
            if (
                section.section_title === "References" ||
                section.section_title === "Acknowledgements"
            ) {
                continue;
            }

            const sectionChunks = await splitter.createDocuments(
                [section.content]
            );

            for (const chunk of sectionChunks) {

                const embedding = await generateEmbedding(chunk.pageContent);
                chunks.push({
                    research_paper_id: paper.id,
                    chunk_index: i,
                    section_title: section.section_title,
                    content: chunk.pageContent,
                    embedding: embedding,
                    metadata: chunk.metadata
                });
                i++;
            }
        }

        const documents = await splitter.createDocuments([
            fullText
        ])
        console.log(
            "Number of chunks:",
            documents.length
        );

        // const chunkRows = [];

        // for (let i = 0; i < documents.length; i++) {
        //     const content = documents[i].pageContent;

        //     const embedding = await generateEmbedding(content);

        //     chunkRows.push({
        //         research_paper_id: paper.id,
        //         chunk_index: i,
        //         content: content,
        //         embedding: embedding,
        //         metadata: {
        //             file_name: file.originalname,
        //             chunk_index: i
        //         }
        //     });
        // }
        // insert chunks into superbase 
        const { error: chunkError } = await superbase.from('research_paper_chunks')
            .insert(chunks);

        if (chunkError) {
            console.error("Chunk Database Error", chunkError)
        }

        return res.status(201).json({ message: "data uploaded successfully" });

    } catch (error) {
        console.log(error)
        return res.status(500).json("storage error occurred");
    }
}

const extractPdfText = async (buffer) => {
    const data = new PDFParse({ data: Buffer.from(buffer) });
    const text = await data.getText();

    return text.text;
};

const QueryResearch = async (req, res) => {
    try {
        const { question } = req.body;

        if (!question || !question.trim()) {
            return res.status(400).json({ message: " Question is required" });
        }

        // generate embedding for the users question 
        const queryEmbedding = await generateEmbedding(question);

        const paper  = await identifyPaper(question);

        const { data: chunks, error } = await superbase.rpc(
            "match_research_paper_chunks",
            {
                query_embedding: queryEmbedding,
                match_count: 15,
                filter_paper_ids: paper
            }
        );

        if (error) {
            console.error("Vector Search error", error);
            return res.status(500).json({ message: "failed to retrieve relevant content" });
        }

        // context prepare from chunks

        const context = chunks.map((chunk, index) =>
            `[Source ${index + 1}]
            Paper ID: ${chunk.title}
            Chunk ID: ${chunk.id}
            Content: ${chunk.content}
            `).join("\n\n");

        // ask gemini 
        const response = await genAI.models.generateContent({
            model: "gemini-2.5-flash",
            contents: `You are a research assistant. Answer the users's questions using the research context provided below
            
            Rules:
                -Analyze the retrieved research papers deeply, using logical reasoning to connect concepts, methods, findings, and research objectives.
                -Go beyond summarizing excerpts by developing evidence-based inferences, identifying patterns, comparing approaches, and explaining their implications.
                -Explain research concepts, methodologies, algorithms, datasets, and evaluation metrics in simple, clear language, including how they work, why they are used, and when relevant, their advantages and limitations.
                -Distinguish explicitly reported facts from logical inferences, interpretations, and hypothetical examples.
                -Use evidence from multiple relevant papers to build coherent discussions, identify similarities and differences, and derive potential research gaps where justified.
                -Explain the reasoning behind conclusions step by step, ensuring that each inference follows logically from the available evidence.
                -Critically examine the relationship between research objectives, methodologies, datasets, evaluation techniques, and findings.
                -Use practical examples and analogies to clarify complex ideas, but never present hypothetical examples as methods or results reported by the authors.
                -Do not include source citations, reference lists, URLs, or source labels in the final answer. Present the discussion naturally, focusing on explanations, reasoning, and insights rather than identifying where each statement originated.
                -Never invent facts, findings, citations, datasets, or experimental procedures. When evidence is incomplete, clearly state what is known, what can reasonably be inferred, and what remains uncertain.
                -Write detailed, meaningful discussions in accessible language, prioritizing understanding, critical analysis, and logical connections over simple summaries.


            Research context:
            ${context}

            User question:
            ${question}`
        });

        const answer = response.text;

        return res.status(200).json(
            {
                question,
                answer,
                sources: chunks.map((chunk, index) => ({
                    source: `Source ${index + 1}`,
                    paper_id: chunk.research_paper_id,
                    chunk_id: chunk.id,
                    chunk_index: chunk.chunk_index,
                    similarity: chunk.similarity,
                    content: chunk.content
                }))
            }
        )
    } catch (error) {
        console.log(error);
        return res.status(500).json({
            message: "Failed to answer question",
            error: error.message
        });
    }
}

const genAI = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY
});

const identifyPaper = async (userQuery) => {
    const { data: papers, error } = await superbase
        .from("research_papers")
        .select("id, title,file_name");

    if (error) throw error;

    const normalize = (text) =>
        text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

    const queryWords = new Set(normalize(userQuery).split(" "));

    const matches = (papers || [])
        .filter(paper => paper.title)
        .map(paper => {
            const words = normalize(paper.title).split(" ");
            const matchedWords = words.filter(word => queryWords.has(word));
            const words2 = normalize(paper.file_name);
            const matchedWords2 = [...queryWords].some(q => words2.includes(q));

            return {
                id: paper.id,
                score: matchedWords.length / words.length,
                isIn: matchedWords2
            };
        })
        .filter(paper => paper.score >= 0.5 || paper.isIn ===true)
        .sort((a, b) => b.score - a.score);

    return matches.length > 0 ? matches.map((match)=> match.id) : null;
};

module.exports = {
    saveResearchPapers,
    QueryResearch
}