document.addEventListener('DOMContentLoaded', () => {
    const inputs = Array.from(document.querySelectorAll('.otp-input'));
    if (!inputs.length) return;
    inputs[0].focus();

    inputs.forEach((input, idx) => {
        input.addEventListener('input', e => {
            const value = e.target.value.replace(/\D/g, '');
            e.target.value = value;
            if (value && idx < inputs.length - 1) {
                inputs[idx + 1].focus();
            }
        });

        input.addEventListener('keydown', e => {
            if (e.key === 'Backspace' && !e.target.value && idx > 0) {
                inputs[idx - 1].focus();
            }
        });
    });

    // Handle paste entire code
    document.getElementById('codeForm').addEventListener('paste', e => {
        const paste = (e.clipboardData || window.clipboardData).getData('text');
        if (/^\d{6}$/.test(paste)) {
            paste.split('').forEach((char, i) => {
                inputs[i].value = char;
            });
            inputs[inputs.length - 1].focus();
            e.preventDefault();
        }
    });
});
