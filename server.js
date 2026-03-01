const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { ElevenLabsClient } = require('@elevenlabs/elevenlabs-js'); // NEW: Official SDK

dotenv.config();
const app = express();
const PORT = process.env.PORT || 3000;

// Initialize ElevenLabs with your new key
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY || "sk_c7c89d2ae26a8ba8eb6763d1f2e3056e8a0dbdece18262ee";
const elevenlabs = new ElevenLabsClient({ apiKey: ELEVENLABS_API_KEY });

const apiKeys = [
    process.env.GEMINI_KEY_1,
    process.env.GEMINI_KEY_2,
    process.env.GEMINI_KEY_3,
    process.env.GEMINI_KEY_4
];

const PEXELS_API_KEY = process.env.PEXELS_API_KEY || "CZ4nOZZBYcF0s1BitZYU8C8IBCK5n1S4S34b1Au21fzjYCdaliQwRoxQ";

let keyIndex = 0;

app.use(cors({ origin: '*' }));
app.use(express.json());
app.use(express.static('public'));

app.post('/api/explain-topic', async (req, res) => {
    const { topic, level } = req.body;

    async function tryGenerate(index) {
        if (index >= apiKeys.length) {
            throw new Error("All API keys are exhausted.");
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

            const prompt = `Act as a world-class educational mentor. Your name is Clarity.
            Explain "${topic}" specifically tailored for a ${level || 'Intermediate'} audience.
            
            SCENE 1 (GREETING): 
            - Subtitle MUST BE EXACTLY: "Welcome to Clarity. Today our objective is to master the core principles of ${topic}."
            - media_type: "image"
            - media_data: "<img src='https://i.ibb.co/mVyKpB5d/Screenshot-2026-03-01-at-10-31-00-AM.png' alt='Clarity Logo' class='w-full h-full object-contain drop-shadow-2xl' />"
            
            FOLLOWING SCENES (8-10 scenes total):
            - YOU ARE THE DIRECTOR. Choose the exact right medium for each scene:
              - REALITY: For tangible objects, nature, or people, use "photo" and provide a simple 1-2 word Pexels search keyword.
              - PROGRAMMING/CODE: If teaching programming, use "code" and provide the raw, perfectly formatted code snippet in media_data.
              - THEORY/DIAGRAMS: For abstract concepts, math, or history, use "svg" and provide raw SVG code.
            
            CRITICAL SVG SPATIAL RULES (NO OVERLAPPING):
            - Use viewBox="0 0 800 400".
            - DO NOT let text and shapes overlap. This is a strict rule.
            - Place all visual shapes STRICTLY in the center (y coordinates between 100 and 300).
            - Place all text labels STRICTLY at the very top (y=40) or very bottom (y=380).
            - Use vibrant neon colors on a transparent background.
            
            INTERACTIVE DATA:
            - "quiz": 6 multiple choice questions appropriate for the ${level} difficulty.
            - "debate": 1 deep, philosophical question.
            - "confidence_score": Provide a confidence percentage string (e.g., "98%").
            
            Return ONLY this JSON structure:
            {
              "confidence_score": "98%",
              "scenes": [
                {
                  "subtitle": "Short detailed sentence (max 20 words).",
                  "media_type": "svg" or "photo" or "image" or "code",
                  "media_data": "SVG code OR search keyword OR image tag OR raw code"
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
                            scene.media_data = `<div class="text-gray-400 font-medium text-xl bg-gray-900 p-8 rounded-3xl flex items-center justify-center h-full border border-gray-800">[ Visualizing: ${scene.media_data} ]</div>`;
                        }
                    } catch (err) {
                        scene.media_data = `<div class="text-gray-400 font-medium text-xl bg-gray-900 p-8 rounded-3xl flex items-center justify-center h-full border border-gray-800">[ System Error ]</div>`;
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

// NEW: Robust SDK-powered TTS Endpoint
app.post('/api/tts', async (req, res) => {
    const { text } = req.body;
    
    try {
        // Use the exact parameters from your example
        const audioStream = await elevenlabs.textToSpeech.convert('JBFqnCBsd6RMkjVDRZzb', {
            text: text,
            model_id: 'eleven_multilingual_v2',
            output_format: 'mp3_44100_128',
        });

        res.setHeader('Content-Type', 'audio/mpeg');
        
        // Convert the Web Stream into chunks and push them directly to the Express response
        const reader = audioStream.getReader();
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            res.write(value); 
        }
        res.end(); // Close the connection once the audio file is fully sent

    } catch (error) {
        console.error("ElevenLabs SDK Error:", error);
        res.status(500).json({ error: "Audio generation failed" });
    }
});

app.listen(PORT, () => console.log(`Clarity Server running on http://localhost:${PORT}`));