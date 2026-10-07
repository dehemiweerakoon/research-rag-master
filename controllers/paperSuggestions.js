const supabase = require("../config/postgres");
const { PDFParse } = require("pdf-parse");
const RecursiveCharacterTextSplitter = require('@langchain/textsplitters')

const saveFullPaper = async (req, res) => {
    const { data: papers, error } = await supabase
        .from("papers_duplicate")
        .select("id, title, abstract, open_access")
        .is("full_embedding", null)
        .limit(10);
    if (error) {
        return res.status(500).json({ message: error.message });
    }
    console.log(papers[0])

    for (const paper of papers) {
        const url = paper.open_access?.oa_url;
        console.log(paper)
        if (url) {
            try {
                const pdfResponse = await fetch(url, {
                    redirect: "follow"
                });

                const pdfBuffer = await pdfResponse.arrayBuffer();

                const firstBytes = Buffer.from(pdfBuffer).subarray(0, 20).toString('utf8');

                if (!firstBytes.startsWith("%PDF")) {
                    console.log("❌ This is NOT a PDF");
                    continue;
                }

                const parser = new PDFParse(
                    { data: Buffer.from(pdfBuffer) }
                );
                const pdfData = await parser.getText();

                const fullText = pdfData.text;

                console.log(fullText);
                await parser.destroy();
            } catch (error) {
                console.error("PDF processing error:", error);
            }
        }
    }
    return res.status(200).json({ "hi": "hg" })
}


module.exports = {
    saveFullPaper
}