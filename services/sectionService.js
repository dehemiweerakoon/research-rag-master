const SECTION_PATTERNS = [
    {
        name: "Abstract",
        pattern: /^abstract\s*$/i
    },
    {
        name: "Introduction",
        pattern: /^(?:\d+(?:\.\d+)*\.?\s+)?introduction\s*$/i
    },
    {
        name: "Literature Review",
        pattern: /^(?:(?:\d+(?:\.\d+)*\.?)\s+)?(?:related work|literature review|background and related work|related studies)\s*$/i
    },
    {
        name: "Methodology",
        pattern: /^(?:(?:\d+(?:\.\d+)*\.?)\s+)?(?:methodology|methods|materials and methods|research methodology|research design|proposed method|experimental setup)\s*$/i
    },
    {
        name: "Results",
        pattern: /^(?:(?:\d+(?:\.\d+)*\.?)\s+)?(?:results|experimental results|findings)\s*$/i
    },
    {
        name: "Discussion",
        pattern: /^(?:(?:\d+(?:\.\d+)*\.?)\s+)?discussion\s*$/i
    },
    {
        name: "Limitations",
        pattern: /^(?:(?:\d+(?:\.\d+)*\.?)\s+)?(?:limitations|study limitations|threats to validity)\s*$/i
    },
    {
        name: "Future Work",
        pattern: /^(?:(?:\d+(?:\.\d+)*\.?)\s+)?(?:future work|future research|directions for future research|further research)\s*$/i
    },
    {
        name: "Conclusion",
        pattern: /^(?:(?:\d+(?:\.\d+)*\.?)\s+)?(?:conclusion|conclusions|conclusion and future work|conclusions and future work)\s*$/i
    },
    {
        name: "References",
        pattern: /^(?:(?:\d+(?:\.\d+)*\.?)\s+)?(?:references|bibliography|works cited)\s*$/i
    },
    {
        name: "Acknowledgements",
        pattern: /^(?:(?:\d+(?:\.\d+)*\.?)\s+)?(?:acknowledgements|acknowledgments|funding|data availability|author contributions)\s*$/i
    }
];

function identifyHeading(line) {
    const normalized = line
        .trim()
        .replace(/\s+/g, " ")
        .replace(/[.:]+$/, "");

    if (!normalized || normalized.length > 100) {
        return null;
    }

    const match = SECTION_PATTERNS.find(section =>
        section.pattern.test(normalized)
    );

    return match ? match.name : null;
}

function extractSections(text) {
    const lines = text.split(/\r?\n/);
    const sections = [];

    let currentSection = "Unclassified";
    let currentLines = [];

    function saveSection() {
        const content = currentLines.join("\n").trim();

        if (content) {
            sections.push({
                section_title: currentSection,
                content
            });
        }
    }

    for (const line of lines) {
        const heading = identifyHeading(line);

        if (heading) {
            saveSection();

            currentSection = heading;
            currentLines = [];
        } else {
            currentLines.push(line);
        }
    }

    saveSection();

    return sections;
}

module.exports = {
    extractSections,
    identifyHeading
};