const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const { GoogleGenerativeAI } = require('@google/generative-ai');

dotenv.config();
const app = express();
const PORT = process.env.PORT || 3000;

const apiKeys = [
    process.env.GEMINI_KEY_1,
    process.env.GEMINI_KEY_2,
    process.env.GEMINI_KEY_3,
    process.env.GEMINI_KEY_4
];

const PEXELS_API_KEY = process.env.PEXELS_API_KEY || "CZ4nOZZBYcF0s1BitZYU8C8IBCK5n1S4S34b1Au21fzjYCdaliQwRoxQ";

let keyIndex = 0;

// Updated CORS to allow cross-origin requests from your future Netlify frontend
app.use(cors({
    origin: '*' 
}));

app.use(express.json());
app.use(express.static('public'));

app.post('/api/explain-topic', async (req, res) => {
    const { topic } = req.body;

    async function tryGenerate(index) {
        if (index >= apiKeys.length) {
            throw new Error("All API keys are exhausted. Please try again later.");
        }

        const currentIdx = (keyIndex + index) % apiKeys.length;
        const currentKey = apiKeys[currentIdx];
        const genAI = new GoogleGenerativeAI(currentKey);

        console.log(`Clarity System: Attempting with Key #${currentIdx + 1}`);

        try {
            const model = genAI.getGenerativeModel({ 
                model: "gemini-2.5-flash-lite",
                generationConfig: { responseMimeType: "application/json" }
            });

            // The Ultimate Clarity Prompt: Logical Media & Dark Mode SVGs
            const prompt = `Act as a world-class mentor. Your name is Clarity.
            Explain "${topic}" in friendly, clear English for a student.
            
            SCENE 1 (THE GREETING): 
            - Subtitle MUST BE EXACTLY: "Welcome to Clarity. I'm your mentor, and today we will learn about ${topic}."
            - media_type: "image"
            - media_data: "<img src='https://i.ibb.co/mVyKpB5d/Screenshot-2026-03-01-at-10-31-00-AM.png' alt='Clarity Logo' class='w-full h-full object-contain drop-shadow-2xl' />"
            
            FOLLOWING SCENES (8-10 scenes total):
            - Detailed storytelling explanation. Include real-world examples.
            - YOU ARE THE DIRECTOR. Choose the most logical visual medium for each scene:
              - REALITY: If the scene describes a tangible object, a specific person, a place, or a real-world event, use "photo" and provide a highly specific search keyword (e.g., "Steve Jobs portrait", "Indian farmer", "rocket launch").
              - THEORY/DIAGRAMS: If the scene explains a process, a mathematical concept, code, or an abstract system, use "svg" and provide the raw SVG code.
            
            CRITICAL SVG STYLING (DARK MODE):
            - The video player background is SOLID BLACK (#0a0a0a).
            - Any SVG you generate MUST use bright, vibrant, high-contrast colors (neon blue, bright green, yellow, bright white, etc.).
            - NEVER use black text, dark lines, or dark shapes in your SVGs, as they will be invisible.
            - Use viewBox="0 0 800 400".
            
            INTERACTIVE DATA:
            - "quiz": EXACTLY 6 challenging multiple choice questions based on the explanation.
            - "debate": 1 deep, philosophical question to spark critical thinking.
            
            Return ONLY this JSON structure:
            {
              "scenes": [
                {
                  "subtitle": "Detailed sentence for this scene (approx 20-30 words).",
                  "media_type": "svg" or "photo" or "image",
                  "media_data": "SVG code OR the search keyword OR the hardcoded image tag"
                }
              ],
              "quiz": [{"q": "...", "o": ["...", "...", "...", "..."], "a": "..."}],
              "debate": "..."
            }`;

            const result = await model.generateContent(prompt);
            const response = await result.response;
            
            let lessonData = JSON.parse(response.text());

            for (let scene of lessonData.scenes) {
                if (scene.media_type === "photo") {
                    try {
                        const pexelsRes = await fetch(`https://api.pexels.com/v1/search?query=${encodeURIComponent(scene.media_data)}&per_page=1`, {
                            headers: { Authorization: PEXELS_API_KEY }
                        });
                        const pexelsData = await pexelsRes.json();
                        
                        if (pexelsData.photos && pexelsData.photos.length > 0) {
                            const imageUrl = pexelsData.photos[0].src.landscape;
                            scene.media_data = `<img src="${imageUrl}" class="w-full h-full object-contain rounded-xl drop-shadow-2xl" alt="${scene.media_data}" />`;
                        } else {
                            // Fallback if Pexels finds no photo
                            scene.media_data = `<div class="text-gray-400 font-medium text-xl bg-gray-900 p-8 rounded-3xl flex items-center justify-center h-full border border-gray-800">[ Visualizing: ${scene.media_data} ]</div>`;
                        }
                    } catch (err) {
                        console.error("Image Fetch Error:", err);
                        scene.media_data = `<div class="text-gray-400 font-medium text-xl bg-gray-900 p-8 rounded-3xl flex items-center justify-center h-full border border-gray-800">[ System Error Loading Visual ]</div>`;
                    }
                }
            }
            
            keyIndex = currentIdx; 
            return lessonData;

        } catch (error) {
            if (error.status === 429 || error.message.includes("429")) {
                console.warn(`Key #${currentIdx + 1} exhausted. Rotating...`);
                return tryGenerate(index + 1);
            }
            throw error;
        }
    }

    try {
        const data = await tryGenerate(0);
        res.json(data);
    } catch (error) {
        console.error("Clarity System Error:", error.message);
        res.status(500).json({ error: "System failed to gain clarity. Please try again." });
    }
});

app.listen(PORT, () => console.log(`Clarity Server running on http://localhost:${PORT}`));