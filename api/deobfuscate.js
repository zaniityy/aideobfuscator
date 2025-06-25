export const config = {
    runtime: 'edge', // Use the Vercel Edge Runtime for streaming
};

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

        const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:streamGenerateContent?key=${apiKey}&alt=sse`;

        const geminiResponse = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });

        if (!geminiResponse.ok || !geminiResponse.body) {
            throw new Error(`The AI service failed. Status: ${geminiResponse.status}`);
        }

        // The response from Gemini is already a stream. We just pass it through.
        // The client will be responsible for reading the stream and parsing the final JSON.
        return new Response(geminiResponse.body, {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
        });

    } catch (error) {
        console.error("Server-side error:", error);
        return new Response(JSON.stringify({ error: error.message || 'An internal server error occurred.' }), { status: 500 });
    }
}
