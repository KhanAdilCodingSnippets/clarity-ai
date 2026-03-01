const explainBtn = document.getElementById('explain-btn');
const landingArea = document.getElementById('landing-area');
const videoStage = document.getElementById('video-stage');
const visualContainer = document.getElementById('visual-container');
const subtitleBox = document.getElementById('subtitle-box');
const progressBar = document.getElementById('progress-bar');
const playbackControls = document.getElementById('playback-controls');
const interactionArea = document.getElementById('interaction-area');
const playPauseBtn = document.getElementById('play-pause-btn');

const bgMusic = new Audio('https://cdn.pixabay.com/download/audio/2022/05/27/audio_1808fbf07a.mp3');
bgMusic.volume = 0.04; 
bgMusic.loop = true;

let currentQuizData = [];
let clarityScenes = [];
let currentSceneIndex = 0;
let isPlaying = false;
let sceneTimeout = null;
let currentTopic = ""; 
let currentConfidence = ""; 
let currentLanguage = "English"; // NEW: Global language state

explainBtn.addEventListener('click', async () => {
    const topicInput = document.getElementById('topic-input');
    const difficultyInput = document.getElementById('difficulty-input'); 
    const languageInput = document.getElementById('language-input'); // Capture Language
    
    currentTopic = topicInput ? topicInput.value : "";
    const currentDifficulty = difficultyInput ? difficultyInput.value : "Intermediate";
    currentLanguage = languageInput ? languageInput.value : "English";
    
    if(!currentTopic) return alert("Please enter a topic to begin your journey.");

    if (landingArea) landingArea.classList.add('hidden');
    if (videoStage) videoStage.classList.remove('hidden');

    if (subtitleBox) subtitleBox.innerText = "Gaining clarity on your topic...";
    if (visualContainer) visualContainer.innerHTML = `<div class="animate-pulse text-gray-300 text-lg md:text-xl font-medium">Preparing your mentor session...</div>`;
    if (progressBar) progressBar.style.width = '0%';
    
    try {
        const response = await fetch('https://clarity-ai-dejg.onrender.com/api/explain-topic', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ 
                topic: currentTopic, 
                level: currentDifficulty,
                language: currentLanguage // Send language to the backend
            })
        });
        
        const data = await response.json();
        
        if (data.scenes && data.quiz) {
            currentQuizData = data.quiz;
            clarityScenes = data.scenes;
            currentConfidence = data.confidence_score || "95%"; 
            setupInteractiveLoop(data);
            startLesson();
        }
    } catch (err) {
        console.error("Fetch Error:", err);
        if (subtitleBox) subtitleBox.innerText = "System error. Please refresh and try again.";
    }
});

function startLesson() {
    currentSceneIndex = 0;
    isPlaying = true;
    playbackControls.classList.remove('hidden');
    bgMusic.play().catch(e => console.log("Music blocked by browser autoplay rules."));
    playCurrentScene();
}

function stopSpeech() {
    if (window.currentAudioObj) {
        window.currentAudioObj.pause();
        window.currentAudioObj.removeAttribute('src'); 
        window.currentAudioObj.load(); 
        window.currentAudioObj = null;
    }
    
    if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
    }
    
    clearTimeout(sceneTimeout);
    
    if (window.currentSpeechResolve) {
        window.currentSpeechResolve();
        window.currentSpeechResolve = null;
    }
}

async function playCurrentScene() {
    if (currentSceneIndex >= clarityScenes.length) {
        endLesson();
        return;
    }

    let scene = clarityScenes[currentSceneIndex]; 

    if (currentSceneIndex === 0) {
        scene.media_data = `<img src="https://i.ibb.co/mVyKpB5d/Screenshot-2026-03-01-at-10-31-00-AM.png" alt="Clarity Logo" class="w-full max-sm mx-auto object-contain" />`;
    }

    let displayMedia = scene.media_data;
    if (scene.media_type === "code") {
        const safeCode = scene.media_data.replace(/</g, '&lt;').replace(/>/g, '&gt;');
        displayMedia = `<div class="w-full max-w-2xl mx-auto bg-[#1e1e1e] rounded-2xl p-6 text-left shadow-2xl border border-gray-700 overflow-x-auto"><pre><code class="text-sm md:text-base text-green-400 font-mono leading-relaxed">${safeCode}</code></pre></div>`;
    }

    if (progressBar) progressBar.style.width = `${((currentSceneIndex + 1) / clarityScenes.length) * 100}%`;
    if (subtitleBox) subtitleBox.innerText = scene.subtitle;
    
    if (visualContainer) {
        visualContainer.innerHTML = `<div class="fade-in scale-100 md:scale-110 flex justify-center items-center w-full h-full">${displayMedia}</div>`;
        const svg = visualContainer.querySelector('svg');
        if (svg) {
            svg.setAttribute('width', '100%');
            svg.setAttribute('height', '100%');
            svg.style.maxHeight = '400px';
        }
    }

    stopSpeech(); 

    if (isPlaying) {
        await new Promise(async (resolve) => {
            window.currentSpeechResolve = resolve;
            
            try {
                const ttsResponse = await fetch('https://clarity-ai-dejg.onrender.com/api/tts', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    // NEW: We now send both the text AND the chosen language to the audio engine
                    body: JSON.stringify({ text: scene.subtitle, language: currentLanguage })
                });
                
                if (!ttsResponse.ok) throw new Error("Audio SDK failed");

                const blob = await ttsResponse.blob();
                const audioUrl = URL.createObjectURL(blob);
                
                if (!isPlaying) return resolve(); 

                window.currentAudioObj = new Audio(audioUrl);
                
                window.currentAudioObj.play().catch(e => console.error("Play blocked:", e));
                
                window.currentAudioObj.onend = () => {
                    if (window.currentSpeechResolve) resolve();
                };
            } catch (err) {
                console.warn("Falling back to native browser TTS:", err.message);
                
                if ('speechSynthesis' in window && isPlaying) {
                    window.speechSynthesis.cancel(); 
                    const msg = new SpeechSynthesisUtterance(scene.subtitle);
                    const voices = window.speechSynthesis.getVoices();
                    
                    // Basic fallback to local Indian voice if Cloud fails
                    const indianVoice = voices.find(v => v.lang.includes('IN'));
                    msg.voice = indianVoice || voices[0];
                    msg.rate = 0.95; 
                    
                    msg.onend = () => { if (window.currentSpeechResolve) resolve(); };
                    msg.onerror = () => { if (window.currentSpeechResolve) resolve(); }; 
                    
                    window.speechSynthesis.speak(msg);
                } else {
                    setTimeout(() => { if (window.currentSpeechResolve) resolve(); }, 3500);
                }
            }
        });

        window.currentSpeechResolve = null;

        if (isPlaying) {
            sceneTimeout = setTimeout(() => {
                if (isPlaying) {
                    currentSceneIndex++;
                    playCurrentScene();
                }
            }, 200); 
        }
    }
}

function togglePlay() {
    isPlaying = !isPlaying;
    if (isPlaying) {
        playPauseBtn.innerHTML = `<svg class="w-8 h-8 md:w-10 md:h-10" fill="currentColor" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>`;
        playCurrentScene();
        bgMusic.play();
    } else {
        playPauseBtn.innerHTML = `<svg class="w-8 h-8 md:w-10 md:h-10" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>`;
        stopSpeech();
        bgMusic.pause();
    }
}

function nextScene() {
    if (currentSceneIndex < clarityScenes.length - 1) {
        stopSpeech();
        currentSceneIndex++;
        isPlaying = true;
        playPauseBtn.innerHTML = `<svg class="w-8 h-8 md:w-10 md:h-10" fill="currentColor" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>`;
        playCurrentScene();
    } else {
        endLesson();
    }
}

function prevScene() {
    if (currentSceneIndex > 0) {
        stopSpeech();
        currentSceneIndex--;
        isPlaying = true;
        playPauseBtn.innerHTML = `<svg class="w-8 h-8 md:w-10 md:h-10" fill="currentColor" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>`;
        playCurrentScene();
    }
}

function replayLesson() {
    stopSpeech();
    currentSceneIndex = 0;
    isPlaying = true;
    playPauseBtn.innerHTML = `<svg class="w-8 h-8 md:w-10 md:h-10" fill="currentColor" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>`;
    playCurrentScene();
}

function endLesson() {
    stopSpeech();
    isPlaying = false;
    bgMusic.pause();
    
    clearTimeout(sceneTimeout); 
    
    if (visualContainer) visualContainer.innerHTML = '';
    
    if (subtitleBox) {
        subtitleBox.innerHTML = `
            <div class="flex flex-col items-center justify-center fade-in">
                <div class="text-[10px] md:text-xs font-bold text-green-400 uppercase tracking-[0.2em] mb-2 md:mb-3 flex items-center gap-2 drop-shadow-md text-center">
                    <svg class="w-3 h-3 md:w-4 md:h-4" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"></path></svg>
                    AI Verified Content (Confidence: ${currentConfidence})
                </div>
                <div class="text-xl md:text-4xl">I hope you gained Clarity on <span class="font-bold text-white">${currentTopic}</span>.</div>
            </div>
        `;
    }
    
    if (interactionArea) {
        interactionArea.classList.remove('hidden');
        showTab('notes');
    }
    
    playPauseBtn.innerHTML = `<svg class="w-8 h-8 md:w-10 md:h-10" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>`;
    window.scrollTo({ top: interactionArea.offsetTop - 50, behavior: 'smooth' });
}

function setupInteractiveLoop(data) {
    const notesContainer = document.getElementById('notes-content');
    const testContainer = document.getElementById('test-content');
    const debateContainer = document.getElementById('debate-content');
    
    if (!testContainer || !debateContainer || !notesContainer) return;

    let notesHTML = `
        <div class="mb-8 md:mb-12 text-center px-4">
            <h2 class="text-3xl md:text-4xl font-black tracking-tight text-gray-900 mb-2 md:mb-4">Session Notes</h2>
            <p class="text-base md:text-lg text-gray-500 font-medium">A complete review of your Clarity session on <span class="text-black font-bold">${currentTopic}</span>.</p>
        </div>
        <div class="space-y-6 md:space-y-12 px-4 md:px-0">
    `;
    
    data.scenes.forEach((scene, index) => {
        if (index === 0) return; 

        let notesMedia = scene.media_data;
        if (scene.media_type === "code") {
            const safeCode = scene.media_data.replace(/</g, '&lt;').replace(/>/g, '&gt;');
            notesMedia = `<div class="w-full h-full bg-[#1e1e1e] p-4 text-left overflow-x-auto rounded-xl"><pre><code class="text-xs md:text-sm text-green-400 font-mono">${safeCode}</code></pre></div>`;
        }

        notesHTML += `
            <div class="bg-white p-6 md:p-8 rounded-[2rem] md:rounded-[2.5rem] shadow-sm border border-gray-100 flex flex-col md:flex-row gap-6 md:gap-10 items-center hover:shadow-md transition-shadow">
                <div class="w-full md:w-5/12 bg-[#0a0a0a] rounded-2xl md:rounded-3xl overflow-hidden flex items-center justify-center p-4 md:p-6 aspect-video">
                    ${notesMedia}
                </div>
                <div class="w-full md:w-7/12 text-center md:text-left">
                    <div class="text-[10px] md:text-xs font-bold text-gray-400 uppercase tracking-widest mb-2 md:mb-3">Key Concept 0${index}</div>
                    <p class="text-lg md:text-xl leading-relaxed text-gray-800 font-medium">${scene.subtitle}</p>
                </div>
            </div>
        `;
    });
    notesHTML += `</div>`;
    notesContainer.innerHTML = notesHTML;

    testContainer.innerHTML = `
        <h2 class="text-2xl md:text-3xl font-black mb-6 md:mb-10 text-center tracking-tight uppercase">Practice Test</h2>
        <div class="px-4 md:px-0">
        ${data.quiz.map((q, i) => `
            <div class="mb-6 md:mb-10 p-6 md:p-10 bg-white/80 backdrop-blur rounded-[2rem] md:rounded-[2.5rem] border border-gray-100 shadow-sm">
                <p class="text-lg md:text-xl font-bold mb-6 md:mb-8 text-gray-800">${i+1}. ${q.q}</p>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
                    ${q.o.map(opt => `
                        <label class="flex items-center gap-3 md:gap-4 p-4 md:p-5 border-2 border-gray-50 rounded-xl md:rounded-2xl cursor-pointer hover:bg-blue-50 hover:border-blue-100 transition-all">
                            <input type="radio" name="q${i}" value="${opt}" class="w-4 h-4 md:w-5 md:h-5 accent-black flex-shrink-0">
                            <span class="text-base md:text-lg font-medium">${opt}</span>
                        </label>
                    `).join('')}
                </div>
            </div>
        `).join('')}
        </div>
        <div class="flex justify-center mt-8 md:mt-12 px-4">
            <button id="submit-quiz-btn" onclick="submitQuiz()" class="w-full md:w-auto bg-black text-white px-8 md:px-16 py-4 md:py-5 rounded-full text-lg md:text-xl font-bold hover:scale-105 transition shadow-2xl">
                SUBMIT FOR EVALUATION
            </button>
        </div>
    `;
    
    debateContainer.innerHTML = `
        <div class="px-4 md:px-0">
            <div class="bg-gray-900 p-8 md:p-12 rounded-[2rem] md:rounded-[3rem] text-white shadow-2xl max-w-4xl mx-auto text-center">
                <h3 class="text-xs md:text-sm font-bold text-gray-400 uppercase tracking-[0.2em] md:tracking-[0.3em] mb-4">The Deep Thought</h3>
                <p class="text-xl md:text-3xl font-medium leading-relaxed italic">"${data.debate}"</p>
            </div>
        </div>
    `;
}

function submitQuiz() {
    let score = 0;
    currentQuizData.forEach((q, i) => {
        const selected = document.querySelector(`input[name="q${i}"]:checked`)?.value;
        if (selected === q.a) score++;
    });

    const resultSection = document.getElementById('result-content');
    if (!resultSection) return;

    resultSection.innerHTML = `
        <div class="px-4 md:px-0">
            <div class="flex flex-col items-center justify-center p-10 md:p-20 bg-white rounded-[2rem] md:rounded-[4rem] border border-gray-100 shadow-2xl text-center">
                <h2 class="text-lg md:text-2xl font-bold text-gray-400 uppercase tracking-widest mb-2 md:mb-4">Your Clarity Score</h2>
                <div class="text-7xl md:text-9xl font-black text-black mb-4 md:mb-8">${score}<span class="text-3xl md:text-4xl text-gray-300"> / ${currentQuizData.length}</span></div>
                <p class="text-base md:text-xl font-medium text-gray-600">${score === currentQuizData.length ? 'Perfect Understanding.' : 'Review the lesson and try again.'}</p>
                <button onclick="replayLesson(); window.scrollTo({ top: 0, behavior: 'smooth' });" class="mt-8 md:mt-12 text-blue-600 font-bold hover:underline">Re-watch Lesson →</button>
            </div>
        </div>
    `;
    
    showTab('result');
    window.scrollTo({ top: resultSection.offsetTop - 100, behavior: 'smooth' });
}

function showTab(id) {
    const tabs = document.querySelectorAll('.tab-content');
    tabs.forEach(t => t.classList.add('hidden'));
    
    const activeTab = document.getElementById(id + '-content');
    if (activeTab) {
        activeTab.classList.remove('hidden');
    }
}