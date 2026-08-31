const supabase = require("../config/postgres");

const getAllPapers = async (req, res) => {

    try {

        let cursor = "*";
        let totalPapers = 0;

        const query = req.body?.query || req.query?.query;
        if (!query) {
            return res.status(400).json({ success: false, message: "Search query is required" });
        }
        console.log("Searching for papers with query:", query);

        const MAX_PAPERS = 1000;
        const apiKeyParam = process.env.OPENALEX_API_KEY ? `&api_key=${process.env.OPENALEX_API_KEY}` : "";

        while (totalPapers < MAX_PAPERS) {

            const url =
                `https://api.openalex.org/works` +
                `?search=${encodeURIComponent(query)}` +
                `&per-page=100` +
                `&cursor=${encodeURIComponent(cursor)}` +
                apiKeyParam;

            console.log("Fetching papers...");

            const response = await fetch(url);

            if (!response.ok) {
                throw new Error(
                    `OpenAlex error: ${response.status}`
                );
            }

            const data = await response.json();

            console.log(
                `Received ${data.results.length} papers`
            );

            const error = await savePapers(data);

            if (error) {
                console.error("Database error:", error);

                return res.status(500).json({
                    response: "Database error occurred",
                    error: error.message
                });
            }

            totalPapers += data.results.length;

            console.log(
                `Total papers saved: ${totalPapers}`
            );

            cursor = data.meta.next_cursor;

            if (!cursor) {
                console.log("No more papers available.");
                break;
            }

            // Wait 1 second before next request
            await new Promise(resolve =>
                setTimeout(resolve, 1000)
            );
        }

        return res.status(201).json({
            response: "Papers collected successfully",
            totalPapers: totalPapers
        });

    } catch (error) {

        console.error("Error:", error);

        return res.status(500).json({
            response: "Failed to collect papers",
            error: error.message
        });
    }
};


const savePapers = async (data) => {

    const papersToInsert = data.results.map(paper => ({
        paper_id: paper.id,
        title: paper.title,

        abstract: convertAbstract(
            paper.abstract_inverted_index
        ),

        authors: paper.authorships,
        publication_year: paper.publication_year,
        doi: paper.doi,
        topics: paper.topics,
        keywords: paper.keywords,
        citation_count: paper.cited_by_count
    }));

    const { error } = await supabase
        .from("papers")
        .upsert(
            papersToInsert,
            {
                onConflict: "paper_id"
            }
        );

    return error;
};


function convertAbstract(invertedIndex) {

    if (!invertedIndex) {
        return null;
    }

    const words = [];

    for (const [word, positions] of Object.entries(invertedIndex)) {

        for (const position of positions) {
            words[position] = word;
        }

    }

    return words.join(" ");
}

const searchPapers = async (req, res) => {
    try {
        const { q, year , minCitations } = req.query;

        if (!q) {
            return res.status(400).json({ message: "search query is required" });
        }
        let query =  supabase.from("papers")
            .select("*");

        query = query.or(`title.ilike.%${q}%,abstract.ilike.%${q}%`);

        if(year){
            query = query.eq('publication_year', Number(year));
        }
        if(minCitations){
            query = query.gte(
                'citation_count',
                Number(minCitations)
            )
        }

        const {data, error} = await query;

        if (error) {
            console.error("Error occurred:", error);

            return res.status(500).json({ message: "Error occurred" });
        }
        return res.status(200).json({
            count: data.length,
            papers: data
        })


    } catch (error) {
        console.error("Error searching papers:", error);
        res.status(500).json({ success: false, message: error.message || "Internal Server Error" });
    }
}




module.exports = {
    getAllPapers,
    searchPapers
};
