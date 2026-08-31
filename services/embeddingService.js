const { HfInference } = require("@huggingface/inference");

const hf = new HfInference(process.env.HF_TOKEN);

const MODEL = "BAAI/bge-base-en-v1.5";

async function generateEmbedding(text) {

    if (!text || !text.trim()) {
        throw new Error("Text is required for embedding");
    }

    const result = await hf.featureExtraction({
        model: MODEL,
        inputs: text
    });

    return result;
}

module.exports = {
    generateEmbedding
};