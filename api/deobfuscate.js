// This file should be placed at /api/deobfuscate.js in your project root.

export default async function handler(request, response) {
    // 1. --- Security and Method Check ---
    if (request.method !== 'POST') {
        response.setHeader('Allow', ['POST']);
        return response.status(405).json({ error: 'Method Not Allowed' });
    }

    // 2. --- Get API Key from Environment Variables ---
    const apiKey = process.env.API_KEY;
    if (!apiKey) {
        console.error("API_KEY environment variable not set.");
        return response.status(500).json({ error: 'API key is not configured on the server.' });
    }

    try {
        // 3. --- Get Code from Request Body ---
        const { code } = request.body;
        if (!code || typeof code !== 'string' || code.trim() === '') {
            return response.status(400).json({ error: 'No code provided in the request body.' });
        }

        // 4. --- Prepare the Prompt and JSON Schema for the Gemini API ---
        const prompt = `
            You are an expert code analyst. Your task is to deobfuscate the provided code and provide a summary of its functionality.
            
            Analyze the following obfuscated code:
            \`\`\`
            ${code}
            \`\`\`
            
            Your response must be a JSON object with two keys:
            1.  "deobfuscatedCode": A string containing the fully deobfuscated, clean, and well-formatted code that is functionally identical to the original.
            2.  "summary": A concise, one-paragraph string summarizing what the deobfuscated code does.
        `;
        
        const payload = {
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            generationConfig: {
                // Set temperature to 0 for more deterministic and accurate results
                temperature: 0, 
                responseMimeType: "application/json",
                responseSchema: {
                    type: "OBJECT",
                    properties: {
                        "deobfuscatedCode": { "type": "STRING" },
                        "summary": { "type": "STRING" }
                    },
                    required: ["deobfuscatedCode", "summary"]
                }
            }
        };
        const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;

        // 5. --- Call the Gemini API ---
        const geminiResponse = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!geminiResponse.ok) {
            const errorData = await geminiResponse.json();
            console.error('Gemini API Error:', errorData);
            throw new Error(`The AI service failed to process the request.`);
        }

        const result = await geminiResponse.json();

        // 6. --- Process the Response and Send to Client ---
        if (result.candidates && result.candidates[0]?.content?.parts[0]?.text) {
            const responseJson = JSON.parse(result.candidates[0].content.parts[0].text);
            return response.status(200).json(responseJson);

        } else {
             if (result.promptFeedback && result.promptFeedback.blockReason) {
                throw new Error(`Request was blocked by the AI service: ${result.promptFeedback.blockReason}`);
            }
            throw new Error("Invalid or empty response from the AI service.");
        }

    } catch (error) {
        console.error("Server-side error:", error);
        return response.status(500).json({ error: error.message || 'An internal server error occurred.' });
    }
}
