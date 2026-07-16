console.log("app.js loaded");

// =====================================================
// Constants
// =====================================================
const SLIDE_DISTANCE = 30;
const SPEECH_LANG = "ko-KR"; 
const SPEECH_RATE = 0.8;
const SWIPE_THRESHOLD = 50;  // ระยะปัดนิ้วขั้นต่ำเพื่อเปลี่ยนคำ (พิกเซล)
const CLICK_THRESHOLD = 10;  // ระยะขยับสูงสุดที่ยังถือว่าเป็นแค่การ "กดคลิก"

// =====================================================
// Application State
// =====================================================
let languageMode   = "ct";      // ct / tc
let studyMode      = "vocab";   // vocab / dialog
let displayMode    = "card";    // card / table

let shuffleMode    = false;
let autoSpeak      = true;
let autoRunning    = false;
let autoShowAnswer = true;

let words          = [];
let cur            = null;
let currentData    = null;    

let currentIndex = 0;
let randomWords  = [];
let randomIndex  = 0;

let autoTimer     = null;
let answerVisible = true;

// Drag / Swipe State Control
let dragging = false;
let startX   = 0;
let isSwipeAction = false; // ตัวแปรคุมสถานะการลากจริง

// =====================================================
// Initialization
// =====================================================
function init() {
    // เช็คก่อนว่า datasets มาหรือยัง
    if (typeof datasets === 'undefined') {
        console.error("ไม่พบข้อมูล datasets!");
        return;
    }
    
    buildCategory();
    changeCategory();
    setupEventListeners();
		
	document.getElementById("languageBtn").onclick = toggleLanguage;
    document.getElementById("studyModeBtn").onclick = toggleStudyMode;
	document.getElementById("speakerBtn").onclick = toggleSpeaker;
	
	document.getElementById("category").addEventListener("change", changeCategory);
    document.getElementById("lesson").addEventListener("change", loadWords);	
	
    document.getElementById("shuffleBtn").onclick = toggleShuffle;
    document.getElementById("answerModeBtn").onclick = toggleAnswerMode;
	document.getElementById("displayModeBtn").onclick = toggleDisplayMode;
	document.getElementById("autoBtn").onclick = toggleAuto;
    	
	document.getElementById("prevBtn").onclick = previous;
	document.getElementById("nextBtn").onclick = next;
}

// ตรวจสอบว่า DOM โหลดเสร็จและ datasets พร้อมแล้วค่อยเริ่ม
window.addEventListener("DOMContentLoaded", () => {
    // ถ้า datasets อยู่ในไฟล์แยกที่โหลดช้า ให้ใช้ setTimeout ช่วยเล็กน้อย
    if (typeof datasets !== 'undefined') {
        init();
    } else {
        // กรณี datasets โหลดทีหลัง
        setTimeout(init, 100); 
    }
});

function buildCategory() {
    const category = document.getElementById("category");
    if (!category) return;

    // มัดรวมสร้างสตริงทีเดียวเพื่อความเร็ว
    const options = Object.keys(datasets).map(name => 
        `<option value="${name}">${name}</option>`
    );
    category.innerHTML = options.join('');
    category.value = "เด็กเล็ก";
}

// =====================================================
// Event Listener Setup & Handle
// =====================================================
function setupEventListeners() {
    const card = document.getElementById("card");
    if (!card) return;

    card.addEventListener("mousedown", startDrag);
    card.addEventListener("mousemove", doDrag);
    card.addEventListener("mouseup", endDrag);
    card.addEventListener("mouseleave", cancelDrag);
    
    // ห้ามผูก 'click' ใดๆ ไว้ที่ #card ในฟังก์ชันนี้อีกเด็ดขาด
}

// =====================================================
// Drag & Swipe Logic
// =====================================================
function startDrag(e) {
    if (e.target.closest("#cardSpeakBtn")) return; // ข้ามปุ่มลำโพง
    
    dragging = true;
    isSwipeAction = false; 
    const card = document.getElementById("card");
    card.style.transition = "none";
    startX = e.clientX;
}

function doDrag(e) {
    if (!dragging) return;
    const diffX = e.clientX - startX;
    
    // ถ้านิ้วขยับเกินค่าที่ตั้งไว้ ให้ถือเป็นการลาก (Swipe) เพื่อไม่ให้สลับคำแปลตอนปล่อยนิ้ว
    if (Math.abs(diffX) > CLICK_THRESHOLD) {
        isSwipeAction = true;
    }
    
    const card = document.getElementById("card");
    card.style.transform = `translateX(${diffX * 0.6}px)`;
}

function endDrag(e) {
    if (!dragging) return;
    dragging = false;

    const card = document.getElementById("card");
    const diffX = e.clientX - startX;

    // ตรวจสอบระยะลากว่าต้องการเปลี่ยนคำศัพท์หรือไม่
    if (Math.abs(diffX) >= SWIPE_THRESHOLD) {
        if (diffX > 0) previous(); else next();
    } else {
        // ลากไม่ถึงเกณฑ์ ให้ดึงการ์ดกลับมาตรงกลาง
        card.style.transition = "transform .2s ease";
        card.style.transform = "translateX(0)";
        
        // บังคับหน่วงสเตทลากลงนิดหน่อย เพื่อให้ไม่ไปทับซ้อนกับ Click Event
        setTimeout(() => { isSwipeAction = false; }, 50);
    }
}

function cancelDrag() {
    if (!dragging) return;
    dragging = false;
    isSwipeAction = false;
    const card = document.getElementById("card");
    card.style.transition = "transform .2s ease";
    card.style.transform = "translateX(0)";
}

// =====================================================
// Data Core Logic
// =====================================================
function changeCategory() {
    const categoryName = document.getElementById("category").value;
    const pack = datasets[categoryName];
    console.log("เลือกหมวด:", categoryName, "ได้ข้อมูล:", pack); // ใส่บรรทัดนี้ไว้เช็ค

    if (!pack) return; // กันพัง
    currentData = (studyMode === "vocab") ? pack.vocab : pack.dialog;
    buildLesson();
    loadWords();
}

function loadWords() {
    words = [];
    if (!currentData || typeof currentData !== "string") return;

    const allLines = currentData.trim().split(/\n/);
    const ep = parseInt(document.getElementById("lesson").value) || 1;
    const start = (ep - 1) * 10;
    const end = start + 10;
    
    const lines = allLines.slice(start, end);

    lines.forEach(l => {
        const p = l.split(/\t+/);
        if (p.length >= 4) {
            words.push({ c: p[0], p: p[1], r: p[2], t: p[3] });
        }
    });

    if (shuffleMode) {
        randomWords = shuffle([...words]);
        randomIndex = 0;
        cur = randomWords[randomIndex];
    } else {
        currentIndex = 0;
        cur = words[currentIndex];
    }   
    
    updateInfoDisplay();
    renderCard();             
    buildTable();
}

function buildLesson() {
    const lesson = document.getElementById("lesson");
    if (!lesson) return;

    const categoryName = document.getElementById("category").value;
    const options = datasets[categoryName].lessons.map((name, index) => 
        `<option value="${index + 1}">${name}</option>`
    );

    lesson.innerHTML = options.join('');
    lesson.value = "1";
}

function buildTable() {
    const tbody = document.querySelector("#wordTable tbody");
    if (!tbody) return;

    const rows = words.map((w, i) => {
        if (studyMode === "dialog") {
            return `<tr>
                <td>
                    <div class="dialog-item">
                        <div class="dialog-title">
                            <div class="dialog-cn">${w.c}</div>
                            <button class="speak-btn-table" id="tableSpeakBtn${i}" data-text="${w.c}">
                                <i class="fa-solid fa-volume-high"></i>
                            </button>
                        </div>
                        <div class="dialog-pinyin">${w.p}</div>
                        <div class="dialog-read">${w.r}</div>
                        <div class="dialog-th">${w.t}</div>
                    </div>
                </td>
            </tr>`;
        } else {
            return `<tr class="vocab-row">                                            
                <td class="vocab-cn">${w.c}</td>
                <td class="vocab-speaker">
                    <button class="speak-btn-table" id="tableSpeakBtn${i}" data-text="${w.c}">
                        <i class="fa-solid fa-volume-high"></i>
                    </button>
                </td>
                <td class="vocab-pinyin">${w.p}</td>
                <td class="vocab-read">${w.r}</td>
                <td class="vocab-th">${w.t}</td>
            </tr>`;
        }
    });

    tbody.innerHTML = rows.join('');

    tbody.querySelectorAll('.speak-btn-table').forEach(btn => {
        btn.addEventListener('click', function(e) {
            e.stopPropagation();
            speakChineseText(this.getAttribute('data-text'), this);
        });
    });
}

// =====================================================
// Card Render Logic (Single Source of Truth)
// =====================================================
function renderCard() {
    const card = document.getElementById("card");
    if (!card || !cur) return;
    applyCardStyle();

    const isCt = languageMode === "ct";
    
    if (studyMode === "vocab") {
		card.innerHTML = `
			<div class="word-line vocab-word-line">
				<div class="chinese">${isCt ? cur.c : cur.t}</div>
				<button id="cardSpeakBtn" class="speak-btn">
					<i class="fa-solid fa-volume-high"></i>
				</button>
			</div>
			<div id="clickable-answer-area"> 
				${answerVisible ? `
					<div class="answer-content">
						<div class="pinyin">${isCt ? cur.p : cur.r}</div>
						<div class="thaiRead">${isCt ? cur.r : cur.p}</div>
						<div class="meaning">${isCt ? cur.t : cur.c}</div>
					</div>` : `
					<div class="answer-placeholder">
						<div class="reveal-text"></div>
					</div>`}
			</div>
		`;
	} else {
		card.innerHTML = `
			<div class="word-line dialog-word-line">
				<div class="chinese">${isCt ? cur.c : cur.t}</div>
				<button id="cardSpeakBtn" class="speak-btn">
					<i class="fa-solid fa-volume-high"></i>
				</button>
			</div>
			<div id="clickable-answer-area"> 
				${answerVisible ? `
					<div class="answer-content">
						<div class="pinyin">${isCt ? cur.p : cur.r}</div>
						<div class="thaiRead">${isCt ? cur.r : cur.p}</div>
						<div class="meaning">${isCt ? cur.t : cur.c}</div>
					</div>` : `
					<div class="answer-placeholder">
						<div class="reveal-text"></div>
					</div>`}
			</div>
		`;
	
	}

    // 1. ผูก Event ปุ่ม Speaker
    const speakBtn = document.getElementById("cardSpeakBtn");
    if(speakBtn) {
        speakBtn.onclick = (e) => {
            e.stopPropagation(); // หยุดไม่ให้ event ไปกวนที่อื่น
            speakChinese();
        };
    }

    // 2. ผูก Event โซนคำตอบ
    const answerArea = document.getElementById("clickable-answer-area");
    if(answerArea) {
        answerArea.onclick = (e) => {
            e.stopPropagation(); // หยุดไม่ให้ event ไปกวนที่อื่น
            if (!isSwipeAction) {
                answerVisible = !answerVisible;
                renderCard();
            }
        };
    }
}

// ผูกฟังก์ชันชั่วคราวเพื่อให้ไม่ขัดแย้งกับลอจิกเก่าตัวอื่น
function showQuestion() { answerVisible = false; renderCard(); }
function showAnswer() { answerVisible = true; renderCard(); }

function updateInfoDisplay() {
    const info = document.getElementById("info");
    if (!info) return;
    const current = shuffleMode ? randomIndex + 1 : currentIndex + 1;
    info.innerHTML = `${current} / ${words.length}`;
}

function nextWord() {
    if (words.length === 0) return;

    if (shuffleMode) {
        randomIndex++;
        if (randomIndex >= randomWords.length) {
            randomWords = shuffle([...words]);
            randomIndex = 0;
        }
        cur = randomWords[randomIndex];                  
    } else {        
        currentIndex++;
        if (currentIndex >= words.length) currentIndex = 0;      
        cur = words[currentIndex];   
    }
    
    // เมื่อเลื่อนคำใหม่ ให้เปลี่ยนโหมดแสดงผลตามสวิตช์ปุ่ม CC ที่ผู้ใช้เปิด/ปิดไว้
    answerVisible = autoShowAnswer; 
    updateInfoDisplay();
}

function previousWord() {
    if (words.length === 0) return;

    if (shuffleMode) {
        randomIndex--;
        if (randomIndex < 0) {
            if (randomWords.length === 0) {
                randomWords = shuffle([...words]);
            }
            randomIndex = randomWords.length - 1;
        }
        cur = randomWords[randomIndex];       
    } else {
        currentIndex--;
        if (currentIndex < 0) currentIndex = words.length - 1;      
        cur = words[currentIndex];
    }
    
    // เมื่อเลื่อนคำใหม่ ให้เปลี่ยนโหมดแสดงผลตามสวิตช์ปุ่ม CC ที่ผู้ใช้เปิด/ปิดไว้
    answerVisible = autoShowAnswer;
    updateInfoDisplay();
}

// =====================================================
// Audio & TTS Engine
// =====================================================
function speakChinese(callback) {
    if (!cur) return;

    if (displayMode === "card") {
        animateButton("cardSpeakBtn");
    } else {
        const index = shuffleMode ? randomIndex : currentIndex;
        animateButton("tableSpeakBtn" + index);
    }

    const utter = new SpeechSynthesisUtterance(cur.c);
    utter.lang = SPEECH_LANG; 
    utter.rate = SPEECH_RATE;

    utter.onend = function() {
        if (callback) callback();
    };

    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utter);
}

function speakChineseText(text, btn) {    
    if (!text) return;
    if (btn) {
        btn.classList.add("pop");
        setTimeout(() => btn.classList.remove("pop"), 250);
    }
    
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = SPEECH_LANG; 
    utter.rate = SPEECH_RATE;

    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utter);
}

// =====================================================
// UI Toggles & Animations
// =====================================================
function toggleLanguage() {
    languageMode = (languageMode === "ct") ? "tc" : "ct";
    animateButton("languageBtn");

    const text = document.getElementById("languageText");
    if (text) {
        text.innerHTML = languageMode === "ct" 
            ? `<span class="cn">가</span><span class="arrow">→</span><span class="th">ก</span>`
            : `<span class="th">ก</span><span class="arrow">→</span><span class="cn">가</span>`; 
    }
    renderCard();
}

function toggleStudyMode() {
    studyMode = (studyMode === "vocab") ? "dialog" : "vocab";
    animateButton("studyModeBtn");

    const icon = document.getElementById("studyModeIcon");
    if (icon) {
        if (studyMode === "vocab") {
            icon.className = "fa-solid fa-chalkboard";
            icon.style.color = "";
        } else {
            icon.className = "fa-regular fa-comments";
            icon.style.color = "#1976d2";
        }
    }
    changeCategory();
}

function toggleShuffle() {
    animateButton("shuffleBtn");
    shuffleMode = !shuffleMode;
    const icon = document.getElementById("shuffleIcon");

    if (icon) {
        if (shuffleMode) {
            icon.className = "fa-solid fa-shuffle";
            icon.style.color = "#2196f3";
            randomWords = shuffle([...words]);
            randomIndex = 0;
            cur = randomWords[randomIndex];
        } else {
            icon.className = "fa-solid fa-list-ol";
            icon.style.color = "";
            currentIndex = 0;
            cur = words[currentIndex];
        }
    }
    
    answerVisible = autoShowAnswer; // สับไพ่แล้วให้สถานะการแปลอิงตามปุ่ม CC
    updateInfoDisplay();
    renderCard();
}

function toggleAnswerMode() {
    animateButton("answerModeBtn");
    autoShowAnswer = !autoShowAnswer;
    const slash = document.getElementById("answerSlash");

    if (slash) {
        if (autoShowAnswer) {
            slash.classList.add("hidden");
            answerVisible = true;
        } else {
            slash.classList.remove("hidden");
            slash.style.color = "#d32f2f";
            answerVisible = false;
        }
    }
    renderCard();
}

function toggleSpeaker() {
    autoSpeak = !autoSpeak;
    animateButton("speakerBtn");
    const slash = document.getElementById("speakerSlash");
    if (slash) {
        if (autoSpeak) {
            slash.classList.add("hidden");
        } else {
            slash.classList.remove("hidden");
            slash.style.color = "#d32f2f";
        }
    }
}

function toggleDisplayMode() {
    animateButton("displayModeBtn");
    const cardWrapper = document.querySelector(".card-wrapper");
    const tableWrapper = document.querySelector(".table-wrapper");
    const icon = document.getElementById("displayModeIcon");    

    displayMode = (displayMode === "card") ? "table" : "card";

    if (cardWrapper && tableWrapper && icon) {
        if (displayMode === "table") {              
            cardWrapper.style.display = "none";
            tableWrapper.style.display = "block";
            icon.className = "fa-solid fa-table";
            icon.style.color = "#2196f3";
            highlightCurrentRow(shuffleMode ? words.indexOf(cur) : currentIndex);
        } else {        
            cardWrapper.style.display = "block";
            tableWrapper.style.display = "none";
            icon.className = "fa-solid fa-laptop-code";
            icon.style.color = "";
            renderCard();
        }
    }
}

function toggleAuto() {
    animateButton("autoBtn");
    autoRunning = !autoRunning;
    const icon = document.getElementById("autoIcon");

    if (autoRunning) {
        if (icon) {
            icon.className = "fa-solid fa-stop";
            icon.style.color = "#2196f3";
        }
        autoPlay();
        autoTimer = setInterval(autoPlay, 5000);
    } else {
        if (icon) {
            icon.className = "fa-solid fa-play";
            icon.style.color = "";
        }
        if (autoTimer) {
            clearInterval(autoTimer);
            autoTimer = null;
        }
    }
}

function autoPlay() {
    showCurrentWord();
    if (autoShowAnswer) {
        showCurrentAnswer();
        playCurrentWord(nextWord);
    } else {
        playCurrentWord(() => {
            showCurrentAnswer();
            nextWord();
        });
    }
}

function showCurrentWord() {
    if (displayMode === "card") {
        renderCard();
    } else {
        const index = shuffleMode ? words.indexOf(cur) : currentIndex;
        highlightCurrentRow(index);
    }
}

function showCurrentAnswer() {
    if (displayMode === "card") {
        answerVisible = true;
        renderCard();
    }
}

function playCurrentWord(callback) {
    if (!autoSpeak) {
        if (callback) callback();
        return;
    }
    speakChinese(callback);
}

function next() {
    animateChange(() => {
        nextWord();
        showCurrentWord();
        if (autoSpeak) playCurrentWord();        
    }, "next"); 
}

function previous() {
    animateChange(() => {
        previousWord();
        showCurrentWord();
        if (autoSpeak) playCurrentWord();        
    }, "previous");
}

function animateButton(id) {
    const btn = document.getElementById(id);
    if (!btn) return;
    btn.classList.add("pop");
    setTimeout(() => btn.classList.remove("pop"), 250);
}

function animateChange(callback, direction) {
    const card = document.getElementById("card");
    if (!card) return;
    card.style.transition = "all .2s ease";
    card.style.transform = direction === "next" ? `translateX(-${SLIDE_DISTANCE}px)` : `translateX(${SLIDE_DISTANCE}px)`;
    card.style.opacity = "0";

    setTimeout(() => {
        callback();
        card.style.transform = "translateX(0)";
        card.style.opacity = "1";
    }, 200);
}

function applyCardStyle() {
    const card = document.getElementById("card");
    if (!card) return;
    card.classList.remove("vocab", "dialog");
    card.classList.add(studyMode);
}

function highlightCurrentRow(index) {
    const rows = document.querySelectorAll("#wordTable tbody tr");
    rows.forEach(row => row.classList.remove("active-row"));
    if (rows[index]) {
        rows[index].classList.add("active-row");
        rows[index].scrollIntoView({ behavior: "smooth", block: "center" });
    }
}

function shuffle(array) {
    return array
        .map(value => ({ value, sort: Math.random() }))
        .sort((a, b) => a.sort - b.sort)
        .map(({ value }) => value);
}

// เช็คความพร้อมของ DOM โหลดแบบสากล
if (document.readyState === "complete" || document.readyState === "interactive") {
    init();
} else {
    window.addEventListener("DOMContentLoaded", init);
}