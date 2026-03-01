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

explainBtn.addEventListener('click', async () => {
    const topicInput = document.getElementById('topic-input');
    currentTopic = topicInput ? topicInput.value : "";
    
    if(!currentTopic) return alert("Please enter a topic to begin your journey.");

    if (landingArea) landingArea.classList.add('hidden');
    if (videoStage) videoStage.classList.remove('hidden');

    if (subtitleBox) subtitleBox.innerText = "Gaining clarity on your topic...";
    if (visualContainer) visualContainer.innerHTML = `<div class="animate-pulse text-gray-300 text-xl font-medium">Preparing your mentor session...</div>`;
    if (progressBar) progressBar.style.width = '0%';
    
    try {
        const response = await fetch('/api/explain-topic', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ topic: currentTopic })
        });
        
        const data = await response.json();
        
        if (data.scenes && data.quiz) {
            currentQuizData = data.quiz;
            clarityScenes = data.scenes;
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

async function playCurrentScene() {
    if (currentSceneIndex >= clarityScenes.length) {
        endLesson();
        return;
    }

    const scene = clarityScenes[currentSceneIndex];

    // Frontend Override: Guarantee the image is perfect for scene 1
    if (currentSceneIndex === 0) {
        scene.media_data = `<img src="https://i.ibb.co/mVyKpB5d/Screenshot-2026-03-01-at-10-31-00-AM.png" alt="Clarity Logo" class="w-full max-w-sm mx-auto object-contain" />`;
    }

    if (progressBar) progressBar.style.width = `${((currentSceneIndex + 1) / clarityScenes.length) * 100}%`;
    if (subtitleBox) subtitleBox.innerText = scene.subtitle;
    
    if (visualContainer) {
        // Updated from scene.diagram to scene.media_data
        visualContainer.innerHTML = `<div class="fade-in scale-110 flex justify-center items-center w-full h-full">${scene.media_data}</div>`;
        const svg = visualContainer.querySelector('svg');
        if (svg) {
            svg.setAttribute('width', '100%');
            svg.setAttribute('height', '100%');
            svg.style.maxHeight = '400px';
        }
    }

    stopSpeech(); // Clear any existing audio/timeouts

    if (isPlaying) {
        await new Promise((resolve) => {
            // Assign to global so we can forcibly resolve it if user skips
            window.currentSpeechResolve = resolve;
            
            if (typeof responsiveVoice !== 'undefined') {
                responsiveVoice.speak(scene.subtitle, "UK English Female", { 
                    onend: () => { if (window.currentSpeechResolve) resolve(); }, 
                    rate: 0.9 
                });
            } else {
                const msg = new SpeechSynthesisUtterance(scene.subtitle);
                msg.onend = () => { if (window.currentSpeechResolve) resolve(); };
                window.speechSynthesis.speak(msg);
            }
        });

        window.currentSpeechResolve = null; // clear it

        // Strict 800ms pause after speech ends before moving to next
        if (isPlaying) {
            sceneTimeout = setTimeout(() => {
                if (isPlaying) {
                    currentSceneIndex++;
                    playCurrentScene();
                }
            }, 800); 
        }
    }
}

function stopSpeech() {
    if (typeof responsiveVoice !== 'undefined') responsiveVoice.cancel();
    window.speechSynthesis.cancel();
    clearTimeout(sceneTimeout);
    if (window.currentSpeechResolve) {
        window.currentSpeechResolve();
        window.currentSpeechResolve = null;
    }
}

function togglePlay() {
    isPlaying = !isPlaying;
    if (isPlaying) {
        playPauseBtn.innerHTML = `<svg class="w-10 h-10" fill="currentColor" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>`;
        playCurrentScene();
        bgMusic.play();
    } else {
        playPauseBtn.innerHTML = `<svg class="w-10 h-10" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>`;
        stopSpeech();
        bgMusic.pause();
    }
}

function nextScene() {
    if (currentSceneIndex < clarityScenes.length - 1) {
        stopSpeech();
        currentSceneIndex++;
        isPlaying = true;
        playPauseBtn.innerHTML = `<svg class="w-10 h-10" fill="currentColor" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>`;
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
        playPauseBtn.innerHTML = `<svg class="w-10 h-10" fill="currentColor" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>`;
        playCurrentScene();
    }
}

function replayLesson() {
    stopSpeech();
    currentSceneIndex = 0;
    isPlaying = true;
    playPauseBtn.innerHTML = `<svg class="w-10 h-10" fill="currentColor" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>`;
    playCurrentScene();
}

function endLesson() {
    stopSpeech();
    isPlaying = false;
    bgMusic.pause();
    
    // Custom closing text
    if (subtitleBox) {
        subtitleBox.innerHTML = `I hope you understood about <span class="font-bold text-black">${currentTopic}</span>, and if you want you can rewatch the video.`;
    }
    
    if (interactionArea) interactionArea.classList.remove('hidden');
    playPauseBtn.innerHTML = `<svg class="w-10 h-10" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>`;
    window.scrollTo({ top: interactionArea.offsetTop - 50, behavior: 'smooth' });
}

function setupInteractiveLoop(data) {
    const testContainer = document.getElementById('test-content');
    const debateContainer = document.getElementById('debate-content');
    
    if (!testContainer || !debateContainer) return;

    testContainer.innerHTML = `
        <h2 class="text-3xl font-black mb-10 text-center tracking-tight uppercase">Practice Test</h2>
        ${data.quiz.map((q, i) => `
            <div class="mb-10 p-10 bg-white/80 backdrop-blur rounded-[2.5rem] border border-gray-100 shadow-sm">
                <p class="text-xl font-bold mb-8 text-gray-800">${i+1}. ${q.q}</p>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                    ${q.o.map(opt => `
                        <label class="flex items-center gap-4 p-5 border-2 border-gray-50 rounded-2xl cursor-pointer hover:bg-blue-50 hover:border-blue-100 transition-all">
                            <input type="radio" name="q${i}" value="${opt}" class="w-5 h-5 accent-black">
                            <span class="text-lg font-medium">${opt}</span>
                        </label>
                    `).join('')}
                </div>
            </div>
        `).join('')}
        <div class="flex justify-center mt-12">
            <button id="submit-quiz-btn" onclick="submitQuiz()" class="bg-black text-white px-16 py-5 rounded-full text-xl font-bold hover:scale-105 transition shadow-2xl">
                SUBMIT FOR EVALUATION
            </button>
        </div>
    `;
    
    debateContainer.innerHTML = `
        <div class="bg-gray-900 p-12 rounded-[3rem] text-white">
            <h3 class="text-sm font-bold opacity-50 uppercase tracking-[0.2em] mb-4">The Deep Thought</h3>
            <p class="text-3xl font-medium leading-relaxed italic">"${data.debate}"</p>
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
        <div class="flex flex-col items-center justify-center p-20 bg-white rounded-[4rem] border border-gray-100 shadow-2xl">
            <h2 class="text-2xl font-bold text-gray-400 uppercase tracking-widest mb-4">Your Clarity Score</h2>
            <div class="text-9xl font-black text-black mb-8">${score}<span class="text-4xl text-gray-300"> / ${currentQuizData.length}</span></div>
            <p class="text-xl font-medium text-gray-600">${score === currentQuizData.length ? 'Perfect Understanding.' : 'Review the lesson and try again.'}</p>
            <button onclick="replayLesson(); window.scrollTo({ top: 0, behavior: 'smooth' });" class="mt-12 text-blue-600 font-bold hover:underline">Re-watch Lesson →</button>
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