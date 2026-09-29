"use strict";

/*
This script pairs one Tone.js note with ripples from the surrounding garden.
The flower stays unchanged so environmental feedback remains the tested variable.
*/

/* Page elements and limits ------------------------------------------------- */
const flowerButton = document.querySelector("#flower");
const gardenCanvas = document.querySelector(".garden");
const soundStatus = document.querySelector("#sound-status");
const rippleLayer = document.querySelector(".ripples");
const activeRipples = new Map();
const reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
const maxActiveRipples = 12;
const noteDuration = 0.28;
const releaseDuration = 0.44;
let flowerSynth;
let isAudioStarting = false;
let lastStartTime = 0;
let responseCount = 0;

/* Ripple feedback ---------------------------------------------------------- */
function removeRipple(ripple) {
    if (!activeRipples.has(ripple)) return;
    // End events and fallback timers share cleanup, including rings removed by the cap.
    clearTimeout(activeRipples.get(ripple));
    activeRipples.delete(ripple);
    ripple.remove();
}

function createRipples(startTime) {
    // Reduced motion keeps a clear response with two smaller, shorter rings.
    const ringCount = reducedMotionQuery.matches ? 2 : 3;
    // Keep both DOM elements and cleanup timers bounded during rapid repeated input.
    while (activeRipples.size > maxActiveRipples - ringCount) {
        removeRipple(activeRipples.keys().next().value);
    }

    const flowerBounds = flowerButton.getBoundingClientRect();
    const layerBounds = rippleLayer.getBoundingClientRect();
    const duration = reducedMotionQuery.matches
        ? 0.28
        : noteDuration + releaseDuration;
    const soundDelay = Math.max(0, startTime - Tone.immediate());
    const endDiameter = reducedMotionQuery.matches
        ? flowerBounds.width * 1.35
        : Math.hypot(layerBounds.width, layerBounds.height);

    // Restart the subtle canvas tint on every note, aligned with the sound.
    gardenCanvas.classList.remove("isResponding");
    gardenCanvas.style.animationDelay = `${soundDelay}s`;
    gardenCanvas.style.setProperty(
        "--response-duration",
        `${noteDuration + releaseDuration}s`
    );
    void gardenCanvas.offsetWidth;
    gardenCanvas.classList.add("isResponding");

    // Rings begin at the flower; their staggered durations end together.
    for (let index = 0; index < ringCount; index++) {
        const ripple = document.createElement("span");
        const stagger = index * (reducedMotionQuery.matches ? 0.03 : 0.07);
        ripple.className = "ripple";
        const rippleLeft = flowerBounds.left + flowerBounds.width / 2 - layerBounds.left;
        const rippleTop = flowerBounds.top + flowerBounds.height / 2 - layerBounds.top;
        ripple.style.left = `${rippleLeft}px`;
        ripple.style.top = `${rippleTop}px`;
        ripple.style.setProperty("--ripple-size", `${flowerBounds.width}px`);
        ripple.style.setProperty("--ripple-end", `${endDiameter}px`);
        ripple.style.setProperty("--ripple-duration", `${duration - stagger}s`);
        ripple.style.animationDelay = `${soundDelay + stagger}s`;

        // Every ring finishes with the release tail; the timeout covers missing animation events.
        const cleanupDelay = (soundDelay + duration) * 1000 + 150;
        const cleanupTimer = setTimeout(() => removeRipple(ripple), cleanupDelay);
        activeRipples.set(ripple, cleanupTimer);
        rippleLayer.append(ripple);
    }
}

for (const eventName of ["animationend", "animationcancel"]) {
    rippleLayer.addEventListener(eventName, event => removeRipple(event.target));
}

gardenCanvas.addEventListener("animationend", event => {
    if (event.target === gardenCanvas && event.animationName === "garden-tint") {
        gardenCanvas.classList.remove("isResponding");
    }
});

function clearRipples() {
    for (const ripple of activeRipples.keys()) removeRipple(ripple);
}

// Discard rings positioned for an old layout or motion setting; the next tap remeasures.
window.addEventListener("resize", clearRipples);
reducedMotionQuery.addEventListener("change", clearRipples);

/* Audio --------------------------------------------------------------------- */
async function playFlower() {
    // Coalescing input during audio startup prevents a delayed burst of notes.
    if (isAudioStarting) return;

    if (typeof Tone === "undefined") {
        soundStatus.textContent = "Sound could not load. Check your connection and reload.";
        return;
    }

    isAudioStarting = true;

    try {
        // A closed audio context cannot be resumed by another tap.
        if (Tone.getContext().state === "closed") {
            soundStatus.textContent = "Sound was disconnected. Reload the page to reconnect audio.";
            return;
        }

        // Tone.start() needs a user gesture; resume again after mobile interruptions.
        if (!flowerSynth || Tone.getContext().state !== "running") {
            soundStatus.textContent = "Starting sound…";
            await Tone.start();
        }

        if (Tone.getContext().state !== "running") {
            soundStatus.textContent = "Audio is unavailable. Try another browser.";
            return;
        }

        if (!flowerSynth) {
            // The same quiet monophonic voice as Prototype 5 isolates visual feedback.
            flowerSynth = new Tone.Synth({
                oscillator: {
                    type: "sine"
                },
                envelope: {
                    attack: 0.025,
                    decay: 0.08,
                    sustain: 0.55,
                    release: releaseDuration,
                    releaseCurve: "linear"
                },
                volume: -16
            }).toDestination();
        }

        // A short lead avoids late scheduling; batched input keeps distinct start times.
        const startTime = Math.max(
            Tone.immediate() + 0.02,
            lastStartTime + flowerSynth.sampleTime
        );
        flowerSynth.triggerAttackRelease("C4", noteDuration, startTime, 0.65);
        lastStartTime = startTime;
        createRipples(startTime);
        // A changing live-region message announces each successful activation.
        soundStatus.textContent = `The garden responded (${++responseCount})`;
    } catch {
        soundStatus.textContent = "Sound could not start. Tap the flower to try again.";
    } finally {
        isAudioStarting = false;
    }
}

/* User input and accessibility -------------------------------------------- */
// Native button clicks support mouse, touch, Enter and Space without double activation.
flowerButton.addEventListener("click", playFlower);
flowerButton.addEventListener("keydown", event => {
    // Holding a key is one gesture, not a repeating sound loop.
    if (event.repeat && (event.key === "Enter" || event.key === " ")) {
        event.preventDefault();
    }
});

flowerButton.disabled = false;
soundStatus.textContent = typeof Tone === "undefined"
    ? "Sound could not load. Check your connection and reload."
    : "";
