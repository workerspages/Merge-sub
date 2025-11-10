document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('login-form');
    const errorMessage = document.getElementById('error-message');

    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault(); // 阻止表单默认提交行为

        const username = document.getElementById('username').value;
        const password = document.getElementById('password').value;
        errorMessage.textContent = ''; // 清空之前的错误信息

        try {
            const response = await fetch('/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ username, password }),
            });

            const result = await response.json();

            if (response.ok) {
                // 登录成功，跳转到主页
                window.location.href = '/';
            } else {
                // 登录失败，显示错误信息
                errorMessage.textContent = result.error || '登录失败';
            }
        } catch (error) {
            console.error('登录请求失败:', error);
            errorMessage.textContent = '无法连接到服务器';
        }
    });
});
