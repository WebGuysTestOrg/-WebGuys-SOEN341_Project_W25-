document.addEventListener('DOMContentLoaded', () => {
    console.log('Login page loaded');
    
    // Check if we were redirected here
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.has('reason')) {
        console.log('Redirected to login. Reason:', urlParams.get('reason'));
    }
});

document.getElementById('loginForm').addEventListener('submit', function (e) {
    e.preventDefault();

    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;

    fetch('/api/auth/login', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ email, password }),
    })
        .then((response) => response.json())
        .then((data) => {
            if (data.error) {
                const errorMessage = document.getElementById('error-message');
                errorMessage.style.display = 'block';
                errorMessage.textContent = data.error;
            } else if (data.redirect) {
                sessionStorage.setItem('user', JSON.stringify(data.user));
                window.location.href = data.redirect;
            }
        })
        .catch((error) => {
            const errorMessage = document.getElementById('error-message');
            errorMessage.style.display = 'block';
            errorMessage.textContent = 'An error occurred during login. Please try again.';
        });
});