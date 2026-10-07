const superbase = require('../config/postgres');
const pdfParse = require("pdf-parse");
const { generateEmbedding } = require("../services/embeddingService");
const { RecursiveCharacterTextSplitter } = require("@langchain/textsplitters");

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
        res.status(201).json({ message: "data uploaded successfully" });

        const fullText = await extractPdfText(file.buffer);

        if (!fullText.trim()) {
            return res.status(400).json({ message: "could not extract text from PDF" });
        }

        const splitter = new RecursiveCharacterTextSplitter({
            chunkSize: 1000,
            chunkOverlap: 200
        })

        const documents = await splitter.createDocuments([
            fullText
        ])
        console.log(
            "Number of chunks:",
            documents.length
        );
        for (let i =0 ;i< documents.length; i++){
            
        }

    } catch (error) {
        console.log(error)
        return res.status(500).json("storage error occurred");
    }
}

const extractPdfText = async (buffer) => {
    const data = await pdfParse(buffer);

    return data.text;
};

module.exports = {
    saveResearchPapers
}