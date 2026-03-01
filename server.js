const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const textToSpeech = require('@google-cloud/text-to-speech');

dotenv.config();
const app = express();
const PORT = process.env.PORT || 3000;

let ttsClient;
try {
    if (process.env.GOOGLE_CREDENTIALS) {
        const credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS);
        ttsClient = new textToSpeech.TextToSpeechClient({ credentials });
        console.log("Clarity System: Google Cloud TTS Initialized Successfully.");
    } else {
        console.warn("Clarity System: GOOGLE_CREDENTIALS not found.");
    }
} catch (error) {
    console.error("Clarity System: Failed to parse GOOGLE_CREDENTIALS.", error.message);
}

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
    // NEW: We now extract language from the frontend
    const { topic, level, language } = req.body;
    const targetLanguage = language || 'English';

    async function tryGenerate(index) {
        if (index >= apiKeys.length) throw new Error("All API keys are exhausted.");

        const currentIdx = (keyIndex + index) % apiKeys.length;
        const currentKey = apiKeys[currentIdx];
        const genAI = new GoogleGenerativeAI(currentKey);

        console.log(`Clarity System: Generating in ${targetLanguage} with Key #${currentIdx + 1}`);

        try {
            const model = genAI.getGenerativeModel({ 
                model: "gemini-2.5-flash-lite",
                generationConfig: { responseMimeType: "application/json" }
            });

            // MULTILINGUAL PROMPT: Translates text but keeps Pexels keywords in English
            const prompt = `Act as a world-class educational mentor. Your name is Clarity.
            Explain "${topic}" specifically tailored for a ${level || 'Intermediate'} audience.
            
            CRITICAL TRANSLATION RULE: You MUST generate ALL subtitles, quiz questions, and the debate question strictly in the ${targetLanguage} language.
            
            SCENE 1 (GREETING): 
            - Subtitle: "Welcome to Clarity. Today our objective is to master the core principles of ${topic}." (Translate this to ${targetLanguage}).
            - media_type: "image"
            - media_data: "<img src='https://i.ibb.co/mVyKpB5d/Screenshot-2026-03-01-at-10-31-00-AM.png' alt='Clarity Logo' class='w-full h-full object-contain drop-shadow-2xl' />"
            
            FOLLOWING SCENES (8-10 scenes total):
            - YOU ARE THE DIRECTOR. Choose the exact right medium for each scene:
              - REALITY: Use "photo". IMPORTANT: Even though the subtitle is in ${targetLanguage}, the Pexels search keyword in media_data MUST BE IN ENGLISH (e.g., "apple", "space", "computer").
              - PROGRAMMING/CODE: Use "code" and provide the raw code snippet.
              - THEORY/DIAGRAMS: Use "svg". Text inside the SVG should be in ${targetLanguage}.
            
            CRITICAL SVG SPATIAL RULES (NO OVERLAPPING):
            - Use viewBox="0 0 800 400".
            - DO NOT let text and shapes overlap. 
            - Place all visual shapes STRICTLY in the center (y coordinates between 100 and 300).
            - Place all text labels STRICTLY at the very top (y=40) or very bottom (y=380).
            - Use vibrant neon colors on a transparent background.
            
            INTERACTIVE DATA (In ${targetLanguage}):
            - "quiz": 6 multiple choice questions appropriate for the ${level} difficulty.
            - "debate": 1 deep, philosophical question.
            - "confidence_score": Provide a confidence percentage string (e.g., "98%").
            
            Return ONLY this JSON structure:
            {
              "confidence_score": "98%",
              "scenes": [
                {
                  "subtitle": "Short detailed sentence translated to ${targetLanguage} (max 20 words).",
                  "media_type": "svg" or "photo" or "image" or "code",
                  "media_data": "SVG code OR English search keyword OR image tag OR raw code"
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

app.post('/api/tts', async (req, res) => {
    // NEW: Extract language alongside text
    const { text, language } = req.body;
    
    if (!ttsClient) {
        return res.status(500).json({ error: "TTS Client not configured." });
    }

    // MAP UI LANGUAGES TO GOOGLE CLOUD REGIONAL VOICES
    const voiceMap = {
        "English": { languageCode: 'en-IN', name: 'en-IN-Neural2-A' },
        "Hindi": { languageCode: 'hi-IN', name: 'hi-IN-Neural2-A' },
        "Gujarati": { languageCode: 'gu-IN', name: 'gu-IN-Standard-A' },
        "Tamil": { languageCode: 'ta-IN', name: 'ta-IN-Standard-A' },
        "Telugu": { languageCode: 'te-IN', name: 'te-IN-Standard-A' },
        "Marathi": { languageCode: 'mr-IN', name: 'mr-IN-Standard-A' },
        "Bengali": { languageCode: 'bn-IN', name: 'bn-IN-Standard-A' },
        "Kannada": { languageCode: 'kn-IN', name: 'kn-IN-Standard-A' },
        "Malayalam": { languageCode: 'ml-IN', name: 'ml-IN-Standard-A' },
        "Punjabi": { languageCode: 'pa-IN', name: 'pa-IN-Standard-A' }
    };

    const voiceConfig = voiceMap[language] || voiceMap["English"];

    try {
        const request = {
            input: { text: text },
            voice: voiceConfig,
            audioConfig: { audioEncoding: 'MP3' },
        };

        const [response] = await ttsClient.synthesizeSpeech(request);

        res.setHeader('Content-Type', 'audio/mpeg');
        res.send(response.audioContent);

    } catch (error) {
        console.error("Google Cloud TTS Error:", error.message);
        res.status(500).json({ error: "Audio generation failed", details: error.message });
    }
});

app.listen(PORT, () => console.log(`Clarity Server running on http://localhost:${PORT}`));