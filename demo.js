/* Hanya dipakai oleh demo.html untuk melihat simulasi di browser.
   JANGAN dimuat di index.html yang dipakai server. */
function runDemo() {
    let t = 0;
    setEngine(true);
    setOdometer(799.4);
    setHealth(0.97);
    setSpeedMode(1);

    setInterval(() => {
        t += 0.05;
        const sp = (Math.sin(t * 0.4 - 1.5) + 1) / 2;
        setSpeed(sp * 62);

        const band = sp * CONFIG.gearCount;
        const gear = Math.min(CONFIG.gearCount, Math.floor(band) + 1);
        setGear(sp < 0.02 ? 0 : gear);
        setRPM(0.3 + (band % 1) * 0.62);

        setHeadlights(Math.floor(t / 8) % 3);
        setSeatbelts(Math.floor(t / 14) % 2 === 1);
        setFuel(0.62 - (t % 60) / 200);
    }, 50);
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', runDemo);
} else {
    runDemo();
}
