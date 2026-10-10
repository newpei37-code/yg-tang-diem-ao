const STORAGE_KEY = "GRADUATION_PROJECT_ACCOUNT_STATUSES";

const RESULTS = {
    success: {
        icon: "✓",
        title: "CHUYỂN ĐIỂM THÀNH CÔNG",
        description: "Yêu cầu chuyển điểm đã được xử lý thành công.",
    },
    failed: {
        icon: "×",
        title: "CHUYỂN ĐIỂM THẤT BẠI",
        description: "Yêu cầu chuyển điểm không thể được xử lý.",
    },
};

const $ = (id) => document.getElementById(id);

const form = $("transferForm");
const sourceInput = $("sourceAccount");
const receiveInput = $("receiveAccount");
const amountInput = $("amount");
const captcha = $("captcha");
const submitBtn = $("submitBtn");
const message = $("message");
const modal = $("resultModal");
const currentAccount = $("currentAccount");
const statusOptions = document.querySelectorAll(".status-option");

const accountStatuses = Object.assign(
    Object.create(null),
    JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}")
);

function showError(text) {
    message.textContent = "⚠ " + text;
    message.hidden = false;
}

function updateTestPanel() {
    const account = receiveInput.value.trim();
    const status = accountStatuses[account.toLowerCase()];

    currentAccount.textContent = account || "Chưa nhập tài khoản nhận";
    currentAccount.classList.toggle("empty", !account);

    for (const option of statusOptions) {
        option.setAttribute("aria-pressed", Boolean(account) && option.dataset.status === status);
    }
}

function requestTransfer(source, receive, amount) {
    const status = accountStatuses[receive.toLowerCase()];
    return new Promise((resolve) => setTimeout(resolve, 800, status));
}

function showResult(status, source, receive, amount) {
    const result = RESULTS[status];
    const icon = $("resultIcon");

    icon.className = "result-icon " + status;
    icon.textContent = result.icon;
    $("resultTitle").textContent = result.title;
    $("resultDescription").textContent = result.description;
    $("modalSource").textContent = source;
    $("modalReceive").textContent = receive;
    $("modalAmount").textContent = amount;

    modal.showModal();
}

amountInput.addEventListener("input", () => {
    const digits = amountInput.value.replace(/\D/g, "");
    amountInput.value = digits ? Number(digits).toLocaleString("vi-VN") : "";
});

receiveInput.addEventListener("input", updateTestPanel);

for (const option of statusOptions) {
    option.addEventListener("click", () => {
        const account = receiveInput.value.trim();

        if (!account) {
            showError("Vui lòng nhập tài khoản nhận trước.");
            return;
        }

        accountStatuses[account.toLowerCase()] = option.dataset.status;
        localStorage.setItem(STORAGE_KEY, JSON.stringify(accountStatuses));
        updateTestPanel();
    });
}

form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const source = sourceInput.value.trim();
    const receive = receiveInput.value.trim();
    const amount = amountInput.value.trim();

    const failedCheck = [
        [!source, "Vui lòng nhập tài khoản nguồn."],
        [!receive, "Vui lòng nhập tài khoản nhận."],
        [source.toLowerCase() === receive.toLowerCase(), "Tài khoản nguồn và tài khoản nhận không được giống nhau."],
        [!amount, "Vui lòng nhập số điểm cần chuyển."],
        [!captcha.checked, "Vui lòng xác nhận CAPTCHA."],
        [!accountStatuses[receive.toLowerCase()], "Vui lòng chọn THÀNH CÔNG hoặc THẤT BẠI ở bảng TEST MODE."],
    ].find(([failed]) => failed);

    message.hidden = true;

    if (failedCheck) {
        showError(failedCheck[1]);
        return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = "ĐANG XỬ LÝ...";

    const status = await requestTransfer(source, receive, amount);

    submitBtn.disabled = false;
    submitBtn.textContent = "XÁC NHẬN CHUYỂN ĐIỂM";
    showResult(status, source, receive, amount);
});

$("closeModal").addEventListener("click", () => modal.close());

modal.addEventListener("click", (event) => {
    if (event.target === modal) {
        modal.close();
    }
});

updateTestPanel();
