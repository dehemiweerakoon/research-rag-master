const supabase = require("../config/postgres");
const { generateEmbedding } = require("../services/embeddingService");

const getAllPapers = async (req, res) => {

    try {

        let cursor = "*";
        let totalPapers = 0;

        const query = req.body?.query || req.query?.query;
        if (!query) {
            return res.status(400).json({ success: false, message: "Search query is required" });
        }
        console.log("Searching for papers with query:", query);

        const MAX_PAPERS = 200;
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

        res.status(201).json({
            response: "Papers collected successfully",
            totalPapers: totalPapers
        });

        setImmediate(async () => {
            const { data: papers, error } = await supabase
                .from("papers")
                .select("id, title, abstract")
                .is("embedding", null)
                .limit(200)

            if (error) {
                return res.status(500).json({ message: error.message });
            }

            for (const paper of papers) {
                const text = `
            Title: ${paper.title}

            Abstract: ${paper.abstract || ""}
        `
                console.log(
                    `Generating embedding for: ${paper.title}`
                );
                const embedding = await generateEmbedding(text);

                const { error: updateError } = await supabase.from("papers")
                    .update({ embedding: embedding })
                    .eq("id", paper.id);

                if (updateError) {
                    console.error("Failed to save embedding:", updateError);
                }
            }
        })

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
        citation_count: paper.cited_by_count,
        open_access: paper.open_access
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
        const { q, year, minCitations } = req.query;

        if (!q) {
            return res.status(400).json({ message: "search query is required" });
        }
        let query = supabase.from("papers")
            .select("*");

        query = query.or(`title.ilike.%${q}%,abstract.ilike.%${q}%`);

        if (year) {
            query = query.eq('publication_year', Number(year));
        }
        if (minCitations) {
            query = query.gte(
                'citation_count',
                Number(minCitations)
            )
        }

        const { data, error } = await query;

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

const savePaperEmbedding = async (req, res) => {

    try {
        const { data: papers, error } = await supabase
            .from("papers")
            .select("id, title, abstract")
            .is("embedding", null)
            .limit(500)

        if (error) {
            return res.status(500).json({ message: error.message });
        }

        for (const paper of papers) {
            const text = `
            Title: ${paper.title}

            Abstract: ${paper.abstract || ""}
        `
            console.log(
                `Generating embedding for: ${paper.title}`
            );
            const embedding = await generateEmbedding(text);

            const { error: updateError } = await supabase.from("papers")
                .update({ embedding: embedding })
                .eq("id", paper.id);

            if (updateError) {
                console.error("Failed to save embedding:", updateError);
            }
        }
        return res.status(200).json({
            message: "Embeddings generated",
            count: papers.length
        });
    } catch (error) {
        return res.status(500).json({
            message: "Embeddings generation error"
        });
    }
}

const semanticSearch = async (req, res) => {
    try {

        const {q} = req.query;

        if( !q || !q.trim()){
            return res.status(400).json({message: "Search query is required"});
        }

        console.log("Search query is :",q)

        //  convert the user query into embedding
        const queryEmbedding = await generateEmbedding(q);

        console.log("Query embedding dimensions :", queryEmbedding.length);

        // NOTE: search Superbase using vector similarity
        const { data , error } = await supabase.rpc(
            "match_papers",
            {
                query_embedding: queryEmbedding,
                match_count: 100
            }
        );
        return res.status(200).json(data);

    } catch (error) {

        console.error("Semantic search error:",error);

        return res.status(500).json({message: error.message});
    }
}

const basicRagQuestions = async(req, res) =>{
        try {

        const {q} = req.query;

        if( !q || !q.trim()){
            return res.status(400).json({message: "Search query is required"});
        }

        console.log("Search query is :",q)

        //  convert the user query into embedding
        const queryEmbedding = await generateEmbedding(q);

        console.log("Query embedding dimensions :", queryEmbedding.length);

        // NOTE: search Superbase using vector similarity
        const { data , error } = await supabase.rpc(
            "match_papers",
            {
                query_embedding: queryEmbedding,
                match_count: 100
            }
        );
        return res.status(200).json(data);

    } catch (error) {

        console.error("Semantic search error:",error);

        return res.status(500).json({message: error.message});
    }
}

module.exports = {
    getAllPapers,
    searchPapers,
    savePaperEmbedding,
    semanticSearch
};
