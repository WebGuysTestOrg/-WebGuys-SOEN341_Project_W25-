document.getElementById('loginForm').addEventListener('submit', function (e) {
    e.preventDefault();

    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;

    fetch('/login', {
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
                // Store user info in sessionStorage for socket connection
                sessionStorage.setItem('user', JSON.stringify(data.user));
                window.location.href = data.redirect;
            }
        })
        .catch((error) => {
            console.error('Error:', error);
            const errorMessage = document.getElementById('error-message');
            errorMessage.style.display = 'block';
            errorMessage.textContent = 'An error occurred during login. Please try again.';
        });
});