import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const PORT = 9333;
const outDir = mkdtempSync(join(tmpdir(), "transfer-ui-"));
const chrome = spawn(process.env.CHROME || "google-chrome", [
    "--headless=new",
    "--no-first-run",
    "--window-size=1280,900",
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${join(outDir, "profile")}`,
    new URL("index.html", import.meta.url).href,
]);

async function findPage() {
    for (let attempt = 0; attempt < 50; attempt++) {
        try {
            const targets = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
            const page = targets.find((target) => target.type === "page" && target.url.endsWith("index.html"));
            if (page) return page;
        } catch {}
        await new Promise((resolve) => setTimeout(resolve, 200));
    }
    throw new Error("Chrome did not open the page");
}

const scenario = async () => {
    const $ = (id) => document.getElementById(id);
    const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const type = (id, value) => {
        $(id).value = value;
        $(id).dispatchEvent(new Event("input"));
    };
    const submit = () => $("transferForm").requestSubmit();
    const steps = {};

    localStorage.clear();
    submit();
    steps.emptyError = $("message").textContent;

    type("sourceAccount", "doggohello");
    type("receiveAccount", "doggohello2");
    type("amount", "200000");
    steps.formattedAmount = $("amount").value;
    steps.panelAccount = $("currentAccount").textContent;

    submit();
    steps.captchaError = $("message").textContent;

    $("captcha").click();
    submit();
    steps.statusError = $("message").textContent;

    for (const status of ["failed", "success"]) {
        document.querySelector(`[data-status="${status}"]`).click();
        submit();
        steps[status + "Busy"] = $("submitBtn").disabled;
        await wait(1300);
        steps[status + "Open"] = $("resultModal").open;
        steps[status + "Title"] = $("resultTitle").textContent;
        steps[status + "Amount"] = $("modalAmount").textContent;
        await window.snap(status);
        $("closeModal").click();
    }

    steps.closed = !$("resultModal").open;
    steps.stored = localStorage.getItem("GRADUATION_PROJECT_ACCOUNT_STATUSES");
    return steps;
};

try {
    const page = await findPage();
    const socket = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((resolve) => socket.addEventListener("open", resolve));

    const pending = new Map();
    let nextId = 0;
    const send = (method, params = {}) =>
        new Promise((resolve) => {
            pending.set(++nextId, resolve);
            socket.send(JSON.stringify({ id: nextId, method, params }));
        });

    socket.addEventListener("message", async ({ data }) => {
        const packet = JSON.parse(data);
        if (packet.id) {
            pending.get(packet.id)(packet.result);
        } else if (packet.method === "Runtime.bindingCalled") {
            const shot = await send("Page.captureScreenshot");
            writeFileSync(join(outDir, packet.params.payload + ".png"), Buffer.from(shot.data, "base64"));
            send("Runtime.evaluate", { expression: "window.snapDone()" });
        }
    });

    await send("Runtime.enable");
    await send("Runtime.addBinding", { name: "snapRequest" });
    await send("Runtime.evaluate", {
        expression: "window.snap = (name) => new Promise((resolve) => { window.snapDone = resolve; window.snapRequest(name); })",
    });

    const idle = await send("Page.captureScreenshot");
    writeFileSync(join(outDir, "idle.png"), Buffer.from(idle.data, "base64"));

    const { result, exceptionDetails } = await send("Runtime.evaluate", {
        expression: `(${scenario})()`,
        awaitPromise: true,
        returnByValue: true,
    });
    assert.equal(exceptionDetails, undefined, JSON.stringify(exceptionDetails));

    assert.deepEqual(result.value, {
        emptyError: "⚠ Vui lòng nhập tài khoản nguồn.",
        formattedAmount: "200.000",
        panelAccount: "doggohello2",
        captchaError: "⚠ Vui lòng xác nhận CAPTCHA.",
        statusError: "⚠ Vui lòng chọn THÀNH CÔNG hoặc THẤT BẠI ở bảng TEST MODE.",
        failedBusy: true,
        failedOpen: true,
        failedTitle: "CHUYỂN ĐIỂM THẤT BẠI",
        failedAmount: "200.000",
        successBusy: true,
        successOpen: true,
        successTitle: "CHUYỂN ĐIỂM THÀNH CÔNG",
        successAmount: "200.000",
        closed: true,
        stored: '{"doggohello2":"success"}',
    });

    console.log("ok - screenshots in " + outDir);
} finally {
    chrome.kill();
}
