export const config = {
    runtime: 'edge', // Use the Vercel Edge Runtime for streaming
};

// This helper function parses the stream from Gemini and extracts the text content.
function createGeminiStreamParser() {
    let buffer = '';
    const decoder = new TextDecoder();
    return new TransformStream({
        transform(chunk, controller) {
            buffer += decoder.decode(chunk);
            // The Gemini stream sends data in a specific format. We need to find complete data chunks.
            let boundary;
            while ((boundary = buffer.indexOf('\\n')) !== -1) {
                const line = buffer.substring(0, boundary).trim();
                buffer = buffer.substring(boundary + 1);
                if (line.startsWith('"text": "')) {
                    try {
                        // Extract the JSON content from the line
                        const jsonString = `{${line}}`;
                        const parsed = JSON.parse(jsonString);
                        controller.enqueue(new TextEncoder().encode(parsed.text));
                    } catch (e) {
                        // Ignore lines that are not valid JSON
                    }
                }
            }
        },
    });
}

export default async function handler(request) {
    if (request.method !== 'POST') {
        return new Response(JSON.stringify({ error: 'Method Not Allowed' }), { status: 405 });
    }

    const apiKey = process.env.API_KEY;
    if (!apiKey) {
        return new Response(JSON.stringify({ error: 'API key is not configured.' }), { status: 500 });
    }

    try {
        const { code } = await request.json();
        if (!code || typeof code !== 'string') {
            return new Response(JSON.stringify({ error: 'No code provided.' }), { status: 400 });
        }

        const prompt = `
            You are an expert code analyst. Your task is to deobfuscate the provided code and provide a summary of its functionality.
            Analyze the following obfuscated code:
            \`\`\`
            ${code}
            \`\`\`
            Your response must be a JSON object with two keys:
            1.  "deobfuscatedCode": A string containing the fully deobfuscated, clean, and well-formatted code.
            2.  "summary": A concise, one-paragraph string summarizing what the deobfuscated code does.
            IMPORTANT: Do not wrap your response in markdown backticks. It must be a raw JSON object.
        `;

        const payload = {
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            generationConfig: {
                temperature: 0,
                responseMimeType: "application/json",
            }
        };

        const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:streamGenerateContent?key=${apiKey}&alt=sse`;

        const geminiResponse = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });

        if (!geminiResponse.ok || !geminiResponse.body) {
            throw new Error(`The AI service failed. Status: ${geminiResponse.status}`);
        }

        // Pipe the response through our parser to extract the clean JSON stream
        const stream = geminiResponse.body.pipeThrough(createGeminiStreamParser());

        return new Response(stream, {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
        });

    } catch (error) {
        console.error("Server-side error:", error);
        return new Response(JSON.stringify({ error: error.message || 'An internal server error occurred.' }), { status: 500 });
    }
}
