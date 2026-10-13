const { GoogleGenAI } = require("@google/genai");

const ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY
});

async function extractPaperTitle(fullText) {
    const firstPageText = fullText.slice(0, 4000);

    const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: `
Extract the exact research paper title from the following text.

Rules:
- Return only the title.
- Do not include author names, affiliations, or the abstract.
- Do not invent a title.
- If the title cannot be identified, return UNKNOWN.

PDF text:
${firstPageText}
`
    });

    const title = response.text?.trim();

    if (!title || title.toUpperCase() === "UNKNOWN") {
        return null;
    }

    return title;
}

module.exports = { extractPaperTitle };