// This file should be placed at /api/deobfuscate.js in your project root.

export default async function handler(request, response) {
    // 1. --- Security and Method Check ---
    // Only allow POST requests
    if (request.method !== 'POST') {
        response.status(405).json({ error: 'Method Not Allowed' });
        return;
    }

    // 2. --- Get API Key from Environment Variables ---
    // This is the secure way to access your key on Vercel.
    const apiKey = process.env.API_KEY;

    if (!apiKey) {
        response.status(500).json({ error: 'API key is not configured on the server.' });
        return;
    }

    try {
        // 3. --- Get Code from Request Body ---
        const { code } = request.body;
        if (!code) {
            response.status(400).json({ error: 'No code provided in the request body.' });
            return;
        }

        // 4. --- Prepare the Prompt for the Gemini API ---
        const prompt = `
            Please deobfuscate the following code. Provide only the deobfuscated code as a direct response, without any additional explanations, introductions, or markdown formatting. Your entire response should be a single block of code.
            
            Obfuscated Code:
            \`\`\`
            ${code}
            \`\`\`
        `;
        
        const chatHistory = [{ role: "user", parts: [{ text: prompt }] }];
        const payload = { contents: chatHistory };
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
            // Forward a generic error to the client for security
            throw new Error(`The AI service failed to process the request.`);
        }

        const result = await geminiResponse.json();

        // 6. --- Process the Response and Send to Client ---
        if (result.candidates && result.candidates[0]?.content?.parts[0]?.text) {
            let deobfuscatedCode = result.candidates[0].content.parts[0].text;
            // Clean up markdown just in case it's there
            deobfuscatedCode = deobfuscatedCode.replace(/^```(?:\w+\n)?/, '').replace(/```$/, '').trim();
            
            // Send the successful response back to the frontend
            response.status(200).json({ deobfuscatedCode: deobfuscatedCode });

        } else {
             if (result.promptFeedback && result.promptFeedback.blockReason) {
                throw new Error(`Request was blocked by the AI service: ${result.promptFeedback.blockReason}`);
            }
            throw new Error("Invalid or empty response from the AI service.");
        }

    } catch (error) {
        console.error("Server-side error:", error);
        // Send a structured error message back to the client
        response.status(500).json({ error: error.message || 'An internal server error occurred.' });
    }
}