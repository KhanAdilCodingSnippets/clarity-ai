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

let keyIndex = 0;

app.use(cors({ origin: '*' }));
app.use(express.json());
app.use(express.static('public'));

app.post('/api/explain-topic', async (req, res) => {
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

            const prompt = `Act as a world-class educational mentor. Your name is Clarity.
            Explain "${topic}" specifically tailored for a ${level || 'Intermediate'} audience.
            
            CRITICAL TRANSLATION & AUDIO RULE: 
            1. You MUST generate ALL subtitles, quiz questions, and the debate question strictly in the ${targetLanguage} language.
            2. The "subtitle" field is read aloud by a Text-to-Speech engine. Write it EXACTLY as a human would speak. Do NOT use quotation marks, underscores, backticks, or camelCase. For example, instead of writing "hello_world", write "hello world".
            
            SPECIAL RULE FOR CODE CORRECTION:
            If the user's topic involves fixing, debugging, or writing code:
            - Explain the bugs and the logic of the fix in the spoken subtitles.
            - You MUST include a scene where the 'media_type' is "code" and 'media_data' contains the final, fully corrected raw code.
            - In the final concluding scene, the subtitle MUST explicitly say: "You can find the corrected code in the notes section." (Translate this to ${targetLanguage} if necessary).
            
            SCENE 1 (GREETING): 
            - Subtitle: "Welcome to Clarity. Today our objective is to master the core principles of ${topic}." (Translate this to ${targetLanguage} phonetically).
            - media_type: "image"
            - media_data: "A hyper-realistic cinematic 3D rendering of the concept: ${topic}, highly detailed, educational illustration, dark background, neon accents, 8k resolution"
            
            FOLLOWING SCENES (8-10 scenes total):
            - YOU ARE THE DIRECTOR. Choose the exact right medium for each scene:
              - REALITY: Use "image". In media_data, write a highly descriptive, detailed visual prompt for an AI image generator in ENGLISH (e.g., "A hyper-realistic 3D rendering of a human heart showing the ventricles, dark background, cinematic lighting"). Do NOT just write a single word.
              - PROGRAMMING/CODE: Use "code" and provide the raw code snippet in media_data.
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
                  "subtitle": "Short detailed phonetic sentence translated to ${targetLanguage} (max 20 words).",
                  "media_type": "svg" or "image" or "code",
                  "media_data": "SVG code OR English descriptive image prompt OR raw code"
                }
              ],
              "quiz": [{"q": "...", "o": ["...", "...", "...", "..."], "a": "..."}],
              "debate": "..."
            }`;

            const result = await model.generateContent(prompt);
            const response = await result.response;
            
            let lessonData = JSON.parse(response.text());

            // ROBUST AI IMAGE GENERATION LOOP
            for (let scene of lessonData.scenes) {
                if (scene.media_type === "image" || scene.media_type === "photo") {
                    try {
                        // Sanitize the AI output: Strip accidental HTML tags or quotes
                        let cleanPrompt = scene.media_data.replace(/<[^>]*>?/gm, '').replace(/["[\]{}]/g, '').trim();
                        
                        // Cap the length so the URL is never invalid
                        if (cleanPrompt.length > 250) {
                            cleanPrompt = cleanPrompt.substring(0, 250);
                        }

                        // Add a random seed to bypass aggressive browser caching
                        const randomSeed = Math.floor(Math.random() * 100000);
                        
                        // Construct the safe URL
                        const safePrompt = encodeURIComponent(`${cleanPrompt}, high quality 3d educational diagram, clean dark background`);
                        const imageUrl = `https://image.pollinations.ai/prompt/${safePrompt}?width=800&height=400&nologo=true&seed=${randomSeed}`;
                        
                        // Ultimate Failsafe: The 'onerror' fallback
                        const fallbackUrl = "https://images.unsplash.com/photo-1451187580459-43490279c0fa?auto=format&fit=crop&w=800&q=80";
                        
                        scene.media_type = "image";
                        scene.media_data = `<img src="${imageUrl}" class="w-full h-full object-contain rounded-xl drop-shadow-2xl" alt="AI Generated Concept" onerror="this.src='${fallbackUrl}'" />`;
                    } catch (err) {
                        scene.media_data = `<div class="text-gray-400 font-medium text-xl bg-gray-900 p-8 rounded-3xl flex items-center justify-center h-full border border-gray-800">[ Visualization Error ]</div>`;
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
    const { text, language } = req.body;
    
    if (!ttsClient) {
        return res.status(500).json({ error: "TTS Client not configured." });
    }

    // THE REGEX SANITIZER: Makes it sound human
    const cleanText = text
        .replace(/_/g, ' ')           
        .replace(/["*`'”"«»]/g, '')   
        .replace(/([a-z])([A-Z])/g, '$1 $2'); 

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
            input: { text: cleanText }, 
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