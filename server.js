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

// THE WATERFALL CURATION ENGINE
async function fetchCuratedImage(academicQuery, visualMetaphor) {
    // 1. Clean the incoming string so we do not crash the APIs
    const cleanQuery = (academicQuery || "education concept").replace(/<[^>]*>?/gm, '').trim();
    const cleanMetaphor = (visualMetaphor || "science").replace(/<[^>]*>?/gm, '').trim();

    // TIER 1: WIKIPEDIA
    try {
        const wikiRes = await fetch(`https://en.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(cleanQuery.substring(0, 50))}&prop=pageimages&format=json&pithumbsize=800`);
        const wikiData = await wikiRes.json();
        const pages = wikiData.query.pages;
        const pageId = Object.keys(pages)[0];
        
        if (pageId !== "-1" && pages[pageId].thumbnail) {
            return pages[pageId].thumbnail.source;
        }
    } catch(e) {}

    // TIER 2: PEXELS
    try {
        const pexelsRes = await fetch(`https://api.pexels.com/v1/search?query=${encodeURIComponent(cleanMetaphor.substring(0, 40))}&per_page=1`, {
            headers: { Authorization: PEXELS_API_KEY }
        });
        const pexelsData = await pexelsRes.json();
        
        if (pexelsData.photos && pexelsData.photos.length > 0) {
            return pexelsData.photos[0].src.landscape;
        }
    } catch(e) {}

    // TIER 3: POLLINATIONS AI (With strict 403 Firewall Prevention)
    // We aggressively truncate to 80 characters so Cloudflare does not block the request
    let shortPrompt = cleanQuery.substring(0, 80).replace(/[^a-zA-Z0-9 ]/g, '');
    const randomSeed = Math.floor(Math.random() * 100000);
    const safePrompt = encodeURIComponent(`${shortPrompt}, educational diagram, cinematic lighting`);
    return `https://image.pollinations.ai/prompt/${safePrompt}?width=800&height=400&nologo=true&seed=${randomSeed}`;
}

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
            1. Generate ALL subtitles and quiz questions strictly in the ${targetLanguage} language.
            2. The "subtitle" field is read aloud. Write it EXACTLY as a human would speak. Do NOT use quotation marks, underscores, backticks, or camelCase. 
            
            SPECIAL RULE FOR CODE CORRECTION:
            If the user's topic involves fixing, debugging, or writing code:
            - Explain the bugs and the logic of the fix in the spoken subtitles.
            - You MUST include a scene where the 'media_type' is "code" and 'media_data' contains the final, fully corrected raw code.
            - In the final concluding scene, the subtitle MUST explicitly say: "You can find the corrected code in the notes section."
            
            SCENE 1 (GREETING): 
            - Subtitle: "Welcome to Clarity. Today our objective is to master the core principles of ${topic}."
            - media_type: "image"
            - academic_query: "${topic}"
            - visual_metaphor: "education"
            
            FOLLOWING SCENES (8-10 scenes total):
            - YOU ARE THE ART DIRECTOR. For every scene, choose the exact right medium:
              - REALITY ("image"): You MUST provide an 'academic_query' (Max 3 words, e.g., "Albert Einstein") AND a 1-word 'visual_metaphor' in English (e.g., "clock"). DO NOT write long descriptive paragraphs.
              - PROGRAMMING ("code"): Provide raw code snippet in 'media_data'.
              - DIAGRAMS ("svg"): Provide precise, vibrant SVG code in 'media_data'. Text inside SVG should be in ${targetLanguage}. Use viewBox="0 0 800 400". NEVER overlap text and shapes.
            
            Return ONLY this JSON structure:
            {
              "confidence_score": "98%",
              "scenes": [
                {
                  "subtitle": "Spoken sentence translated to ${targetLanguage}.",
                  "media_type": "svg" or "image" or "code",
                  "media_data": "SVG code OR raw code snippet (Leave empty if media_type is image)",
                  "academic_query": "Max 3 word noun for Wikipedia (Leave empty if code/svg)",
                  "visual_metaphor": "1-word real world object for Pexels (Leave empty if code/svg)"
                }
              ],
              "quiz": [{"q": "...", "o": ["...", "...", "...", "..."], "a": "..."}],
              "debate": "..."
            }`;

            const result = await model.generateContent(prompt);
            const response = await result.response;
            
            let lessonData = JSON.parse(response.text());

            for (let scene of lessonData.scenes) {
                if (scene.media_type === "image" || scene.media_type === "photo") {
                    try {
                        scene.media_type = "image";
                        const finalImageUrl = await fetchCuratedImage(scene.academic_query || topic, scene.visual_metaphor || "education");
                        const fallbackUrl = "https://images.unsplash.com/photo-1451187580459-43490279c0fa?auto=format&fit=crop&w=800&q=80";
                        scene.media_data = `<img src="${finalImageUrl}" class="w-full h-full object-contain rounded-xl drop-shadow-2xl" alt="Educational Visual" onerror="this.src='${fallbackUrl}'" />`;
                    } catch (err) {
                        scene.media_data = `<div class="text-gray-400 font-medium text-xl bg-gray-900 p-8 rounded-3xl flex items-center justify-center h-full border border-gray-800">[ Visualization Unavailable ]</div>`;
                    }
                } else if (scene.media_type === "svg") {
                     scene.media_data = scene.media_data.replace(/```xml|```svg|```/g, '').trim();
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
    
    // SAFETY CATCH: Prevent 500 errors if text is missing
    if (!text || text.trim() === '') {
        return res.status(400).json({ error: "No text provided for TTS." });
    }
    
    if (!ttsClient) {
        return res.status(500).json({ error: "TTS Client not configured." });
    }

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
        // Log the exact Google Cloud error to Render so you know if it's a quota issue
        console.error("Google Cloud TTS Error Details:", error);
        res.status(500).json({ error: "Audio generation failed", details: error.message });
    }
});

app.listen(PORT, () => console.log(`Clarity Server running on port ${PORT}`));