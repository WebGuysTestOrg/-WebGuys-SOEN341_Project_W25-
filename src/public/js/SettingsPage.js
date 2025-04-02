function showToast(message, type = 'success') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerText = message;

    document.getElementById('toast-container').appendChild(toast);

    setTimeout(() => {
        toast.classList.add('hide');
        toast.addEventListener('transitionend', () => { toast.remove() });
    }, 3000);
}

// Load user information
fetch('/user-info')
    .then(response => {
        if (!response.ok) throw new Error('Unauthorized');
        return response.json();
    })
    .then(data => {
        document.getElementById('name').value = data.name;
        document.getElementById('currentEmail').value = data.email;
    })
    .catch(() => window.location.href = '/Login-Form.html');

// Update Email
document.getElementById('updateEmailBtn').addEventListener('click', function() {
    const newEmail = document.getElementById('newEmail').value;
    const currentPassword = document.getElementById('emailCurrentPassword').value;

    if (!newEmail) {
        showToast("Please enter a new email address", 'error');
        return;
    }

    if (!currentPassword) {
        showToast("Please enter your current password", 'error');
        return;
    }

    fetch('/update-email', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            newEmail: newEmail,
            currentPassword: currentPassword
        })
    })
    .then(response => response.json())
    .then(data => {
        if (data.error) {
            showToast(data.error, 'error');
        } else {
            showToast(data.message || "Email updated successfully");
            document.getElementById('currentEmail').value = newEmail;
            document.getElementById('newEmail').value = '';
            document.getElementById('emailCurrentPassword').value = '';
        }
    })
    .catch(error => {
        console.error('Error:', error);
        showToast('An error occurred while updating the email', 'error');
    });
});

// Update Password
document.getElementById('updatePasswordBtn').addEventListener('click', function() {
    const currentPassword = document.getElementById('currentPassword').value;
    const newPassword = document.getElementById('newPassword').value;
    const confirmPassword = document.getElementById('confirmPassword').value;

    if (!currentPassword) {
        showToast("Please enter your current password", 'error');
        return;
    }

    if (!newPassword) {
        showToast("Please enter a new password", 'error');
        return;
    }

    if (newPassword !== confirmPassword) {
        showToast("New passwords do not match", 'error');
        return;
    }

    fetch('/update-password', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            currentPassword: currentPassword,
            newPassword: newPassword,
            confirmPassword: confirmPassword
        })
    })
    .then(response => response.json())
    .then(data => {
        if (data.error) {
            showToast(data.error, 'error');
        } else {
            showToast(data.message || "Password updated successfully");
            document.getElementById('currentPassword').value = '';
            document.getElementById('newPassword').value = '';
            document.getElementById('confirmPassword').value = '';
        }
    })
    .catch(error => {
        console.error('Error:', error);
        showToast('An error occurred while updating the password', 'error');
    });
});