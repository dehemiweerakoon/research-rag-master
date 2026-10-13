const superbase = require('../config/postgres');
const { PDFParse } = require("pdf-parse");
const { generateEmbedding } = require("../services/embeddingService");
const { RecursiveCharacterTextSplitter } = require("@langchain/textsplitters");
const { GoogleGenAI } = require("@google/genai");
const { extractSections, identifyHeading } = require("../services/sectionService");

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
        // save info in the database
        const { data: paper, error: databaseError } = await superbase.from('research_papers')
            .insert({
                file_name: file.originalname,
                file_path: storageData.path,
            }).select().single();

        if (databaseError) {
            console.log(databaseError)
            return res.status(500).json({
                message: "Storage error occurred",
                error: databaseError,
                details: databaseError
            });
        }

        const fullText = await extractPdfText(file.buffer);

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

        const { data: chunks, error } = await superbase.rpc(
            "match_research_paper_chunks",
            {
                query_embedding: queryEmbedding,
                match_count: 5
            }
        );

        if (error) {
            console.error("Vector Search error", error);
            return res.status(500).json({ message: "failed to retrieve relevant content" });
        }

        // context prepare from chunks

        const context = chunks.map((chunk, index) =>
            `[Source ${index + 1}]
            Paper ID: ${chunk.research_paper_id}
            Chunk ID: ${chunk.id}
            Content: ${chunk.content}
            `).join("\n\n");

        // ask gemini 
        const response = await genAI.models.generateContent({
            model: "gemini-3.5-flash-lite",
            contents: `You are a research assistant. Answer the users's questions using the research context provided below
            
            Rules:
            Identify the research approaches, methods, research designs, datasets, and evaluation techniques explicitly described in the excerpts.
            Distinguish between quantitative, qualitative, mixed-methods, experimental, survey-based, case-study, and computational approaches only when supported by the evidence.
            For each identified approach, explain which research paper used it and how it was applied.
            Cite supporting evidence using [Source 1], [Source 2], etc.
            Do not infer a methodology from a paper's title or reference list alone.
            If the retrieved excerpts contain only references, funding statements, acknowledgements, or data availability statements, explicitly state that the methodology cannot be established from the retrieved evidence.
            Do not invent details or citations.
            
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

module.exports = {
    saveResearchPapers,
    QueryResearch
}