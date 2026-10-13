const { pipeline } = require("@huggingface/transformers");

const MODEL = "Xenova/bge-base-en-v1.5";

let extractor = null;

async function generateEmbedding(text) {

    if (!text || !text.trim()) {
        throw new Error("Text is required for embedding");
    }

    if (!extractor) {

        console.log("Loading embedding model...");

        extractor = await pipeline(
            "feature-extraction",
            MODEL
        );

        console.log("Embedding model loaded");
    }

    const output = await extractor(text, {
        pooling: "mean",
        normalize: true
    });

    return Array.from(output.data);
}

module.exports = {
    generateEmbedding
};