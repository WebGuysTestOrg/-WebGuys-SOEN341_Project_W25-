function showToast(message, type = 'success') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerText = message;

    document.getElementById('toast-container').appendChild(toast);

    setTimeout(() => {
        toast.classList.add('hide');
        toast.addEventListener('transitionend', () => { toast.remove() });
    }, 500);
}

document.getElementById('registerForm').addEventListener('submit', function (e) {
    e.preventDefault();

    const name = document.getElementById('name').value;
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    const cpassword = document.getElementById('cpassword').value;
    const user_type = document.getElementById('user_type').value;

    const errorMessage = document.getElementById('error-message');
    errorMessage.style.display = 'none';

    fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password, cpassword, user_type }),
    })
        .then(response => response.json())
        .then(data => {
            if (data.error) {
                errorMessage.style.display = 'block';
                errorMessage.textContent = data.error;
            } else if (data.redirect) {
                showToast("Account has been created!")
                setTimeout(() => {
                    window.location.href = data.redirect;
                }, 1000);
            }
        })
        .catch(error => {
            console.error('Error:', error);
            errorMessage.style.display = 'block';
            errorMessage.textContent = 'Something went wrong. Please try again.';
        });
}); 