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

const tabBtn = document.querySelectorAll(".tab");
const tab = document.querySelectorAll(".tabShow");

function tabs(panelIndex) {
    tab.forEach(function (node) {
        node.style.display = "none";
    });
    tab[panelIndex].style.display = "block";
}

tabs(0);

// Fetch user info
fetch('/user-info')
    .then(response => {
        if (!response.ok) throw new Error('Unauthorized');
        return response.json();
    })
    .then(data => {
        console.log(data);
        document.getElementById('name').value = data.name;
        document.getElementById('email').value = data.email;
    })
    .catch(() => window.location.href = '/login_form.html');

// Handle settings form submission
document.getElementById('settingsForm').addEventListener('submit', (event) => {
    event.preventDefault();

    const newPassword = document.getElementById('password').value;
    const confirmPassword = document.getElementById('cpassword').value;

    if (newPassword !== confirmPassword) {
        showToast("Passwords do not match!", 'error');
        return;
    }

    fetch('/update-password', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            newPassword: newPassword,
            confirmPassword: confirmPassword
        })
    })
        .then(response => response.json())
        .then(data => {
            if (data.error) {
                showToast(data.error, 'error');
            } else {
                showToast(data.message);
            }
        })
        .catch(error => {
            console.error('Error:', error);
            alert('An error occurred while updating the password.');
        });
}); 