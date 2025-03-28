let userTeams = {};
const socket = io('ws://localhost:3000');

function fetchUserTeams() {
    fetch('/get-user-teams')
        .then(response => response.json())
        .then(teams => {
            userTeams = {};  // Reset userTeams object
            const teamsContainer = document.getElementById("teams-container");
            teamsContainer.innerHTML = "";

            teams.forEach(team => {
                // Store team data
                userTeams[team.teamId] = team;
                
                // Create team card
                let teamElement = document.createElement("div");
                teamElement.classList.add("team-card");

                let teamHeader = document.createElement("div");
                teamHeader.classList.add("team-header");
                teamHeader.innerHTML = `
                    <h3>(${team.teamId}) ${team.teamName}</h3>
                    <p><strong>Created by:</strong> ${team.creatorName || "Unknown"}</p>
                    <div class="team-members">
                        <strong>Members:</strong> ${team.members.length > 0 ? team.members.join(", ") : "No members"}
                    </div>
                `;

                // Add channel creation form
                let createChannelForm = document.createElement("div");
                createChannelForm.classList.add("create-channel-form");
                createChannelForm.innerHTML = `
                    <div class="channel-form-header">
                        <button class="btn show-channel-form">
                            <i class="fas fa-plus"></i> Create Channel
                        </button>
                    </div>
                    <form class="channel-form" style="display: none;">
                        <input type="text" class="channel-name-input" placeholder="Enter Channel Name" required>
                        <div class="channel-helper">Channel name can contain letters, numbers, hyphens and underscores</div>
                        <button type="submit" class="btn create-channel-btn">
                            <i class="fas fa-plus"></i> Create
                        </button>
                    </form>
                `;

                // Add event listeners for channel creation
                const showFormBtn = createChannelForm.querySelector('.show-channel-form');
                const channelForm = createChannelForm.querySelector('.channel-form');
                const channelNameInput = createChannelForm.querySelector('.channel-name-input');

                showFormBtn.addEventListener('click', () => {
                    channelForm.style.display = channelForm.style.display === 'none' ? 'block' : 'none';
                });

                channelForm.addEventListener('submit', async (e) => {
                    e.preventDefault();
                    const channelName = channelNameInput.value.trim();

                    if (!channelName) {
                        showToast("Channel name is required", "error");
                        return;
                    }

                    // Validate channel name format
                    const channelNameRegex = /^[a-zA-Z0-9_-]+$/;
                    if (!channelNameRegex.test(channelName)) {
                        showToast("Channel name can only contain letters, numbers, hyphens and underscores", "error");
                        return;
                    }

                    try {
                        const response = await fetch('/create-channel', {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json'
                            },
                            body: JSON.stringify({
                                channelName: channelName,
                                teamId: team.teamId
                            })
                        });

                        const data = await response.json();
                        
                        if (!response.ok) {
                            throw new Error(data.error || 'Failed to create channel');
                        }

                        showToast("Channel created successfully!", "success");
                        channelForm.style.display = 'none';
                        channelNameInput.value = '';
                        fetchUserTeams(); // Refresh the teams display
                    } catch (err) {
                        console.error("Error creating channel:", err);
                        showToast(err.message || "Failed to create channel", "error");
                    }
                });

                let channelsSection = document.createElement("div");
                channelsSection.classList.add("channels-section");

                // Display channels
                if (team.channels && Object.keys(team.channels).length > 0) {
                    Object.values(team.channels).forEach(channel => {
                        let channelElement = document.createElement("div");
                        channelElement.classList.add("channel-item");
                        
                        let channelContent = document.createElement("div");
                        channelContent.classList.add("channel-content");
                        channelContent.innerHTML = `
                            <div class="channel-header">
                                <h4>📢 ${channel.channelName}</h4>
                                <button class="assign-user-btn" title="Assign User">
                                    <i class="fas fa-user-plus"></i>
                                </button>
                            </div>
                            <p class="channel-members"><strong>Members:</strong> ${channel.members.length > 0 ? channel.members.join(", ") : "No members"}</p>
                        `;

                        // Create hidden assignment form
                        let assignForm = document.createElement("div");
                        assignForm.classList.add("channel-assign-form");
                        assignForm.style.display = "none";
                        
                        // Filter out members already in the channel
                        const availableMembers = team.members.filter(member => 
                            !channel.members.includes(member)
                        );

                        assignForm.innerHTML = `
                            <div class="assign-form-content">
                                <select class="team-members-select">
                                    <option value="">Select Team Member</option>
                                    ${availableMembers.map(member => 
                                        `<option value="${member}">${member}</option>`
                                    ).join('')}
                                </select>
                                <button class="btn assign-btn" disabled>
                                    <i class="fas fa-plus"></i> Add
                                </button>
                                <button class="btn cancel-btn">
                                    <i class="fas fa-times"></i>
                                </button>
                            </div>
                        `;

                        // Add event listeners
                        const assignUserBtn = channelContent.querySelector('.assign-user-btn');
                        assignUserBtn.addEventListener('click', (e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            // Close any other open forms first
                            document.querySelectorAll('.channel-assign-form').forEach(form => {
                                if (form !== assignForm) {
                                    form.style.display = "none";
                                }
                            });
                            assignForm.style.display = assignForm.style.display === "none" ? "block" : "none";
                        });

                        const cancelBtn = assignForm.querySelector('.cancel-btn');
                        cancelBtn.addEventListener('click', (e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            assignForm.style.display = "none";
                        });

                        const memberSelect = assignForm.querySelector('.team-members-select');
                        const assignBtn = assignForm.querySelector('.assign-btn');
                        
                        memberSelect.addEventListener('change', () => {
                            assignBtn.disabled = !memberSelect.value;
                        });

                        assignBtn.addEventListener('click', async (e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            
                            const selectedUser = memberSelect.value;
                            if (!selectedUser) {
                                showToast("Please select a team member", "error");
                                return;
                            }

                            // Disable the button and show loading state
                            assignBtn.disabled = true;
                            assignBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Adding...';

                            try {
                                const response = await fetch('/assign-user', {
                                    method: 'POST',
                                    headers: {
                                        'Content-Type': 'application/json'
                                    },
                                    body: JSON.stringify({
                                        teamId: team.teamId,
                                        channelName: channel.channelName,
                                        userName: selectedUser
                                    })
                                });

                                const data = await response.json();
                                
                                if (!response.ok) {
                                    throw new Error(data.error || 'Failed to assign user');
                                }

                                // Show success notification
                                showToast(`Successfully assigned ${selectedUser} to channel ${channel.channelName}`, "success");
                                
                                // Update the members list with the new data
                                const membersP = channelContent.querySelector('.channel-members');
                                membersP.innerHTML = `<strong>Members:</strong> ${data.updatedMembers.join(', ')}`;
                                
                                // Hide the form
                                assignForm.style.display = "none";
                                
                                // Reset the form
                                memberSelect.value = '';
                                assignBtn.disabled = true;

                                // Remove the assigned user from the dropdown
                                Array.from(memberSelect.options).forEach(option => {
                                    if (option.value === selectedUser) {
                                        option.remove();
                                    }
                                });

                                // If no more members to add, disable the assign button
                                if (memberSelect.options.length <= 1) { // Only the default option left
                                    assignUserBtn.disabled = true;
                                    assignUserBtn.title = 'All team members are already in this channel';
                                }

                            } catch (err) {
                                console.error("Error assigning user:", err);
                                showToast(err.message || "Failed to assign user", "error");
                            } finally {
                                // Reset button state
                                assignBtn.disabled = false;
                                assignBtn.innerHTML = '<i class="fas fa-plus"></i> Add';
                            }
                        });

                        channelElement.appendChild(channelContent);
                        channelElement.appendChild(assignForm);
                        channelsSection.appendChild(channelElement);
                    });
                } else {
                    let noChannelsMsg = document.createElement("p");
                    noChannelsMsg.textContent = "No channels yet";
                    noChannelsMsg.style.fontStyle = "italic";
                    channelsSection.appendChild(noChannelsMsg);
                }

                let teamsButton = document.createElement("button");
                teamsButton.textContent = "Open Team Chat";
                teamsButton.classList.add("teamsButton");
                teamsButton.addEventListener("click", () => {
                    window.location.href = `teams_chat.html?team=${encodeURIComponent(team.teamName)}`;
                });

                teamElement.appendChild(teamHeader);
                teamElement.appendChild(createChannelForm);
                teamElement.appendChild(channelsSection);
                teamElement.appendChild(teamsButton);
                teamsContainer.appendChild(teamElement);
            });
        })
        .catch(err => {
            console.error("Error fetching teams:", err);
            showToast("Failed to load teams. Please try again.", "error");
        });
}

// Initialize page
document.addEventListener("DOMContentLoaded", () => {
    fetch('/user-info')
        .then(response => response.json())
        .then(data => {
            document.getElementById('username').textContent = data.name;
            fetchUserTeams();
        })
        .catch(() => window.location.href = '/Login-Form.html');
});

// Add this function to update a specific channel's members
function updateChannelMembers(teamId, channelName, newMember) {
    const teamCard = document.querySelector(`.team-card h3:contains("(${teamId})")`).closest('.team-card');
    const channelItem = teamCard.querySelector(`.channel-item h4:contains("${channelName}")`).closest('.channel-item');
    const membersP = channelItem.querySelector('.channel-members');
    
    let currentMembers = membersP.textContent.replace('Members:', '').trim();
    currentMembers = currentMembers === 'No members' ? [] : currentMembers.split(', ');
    
    if (!currentMembers.includes(newMember)) {
        currentMembers.push(newMember);
        membersP.innerHTML = `<strong>Members:</strong> ${currentMembers.join(', ')}`;
        
        // Update the available members in the dropdown
        const memberSelect = channelItem.querySelector('.team-members-select');
        if (memberSelect) {
            Array.from(memberSelect.options).forEach(option => {
                if (option.value === newMember) {
                    option.remove();
                }
            });
            
            // If no more members to add, disable the assign button
            const assignUserBtn = channelItem.querySelector('.assign-user-btn');
            if (memberSelect.options.length <= 1) { // Only the default option left
                assignUserBtn.disabled = true;
                assignUserBtn.title = 'All team members are already in this channel';
            }
        }
    }
}

// Enhanced toast notification function
function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    // Add icon based on type
    let icon = '';
    switch(type) {
        case 'success':
            icon = '<i class="fas fa-check-circle"></i> ';
            break;
        case 'error':
            icon = '<i class="fas fa-exclamation-circle"></i> ';
            break;
        default:
            icon = '<i class="fas fa-info-circle"></i> ';
    }
    
    toast.innerHTML = icon + message;
    
    const container = document.getElementById('toast-container');
    container.appendChild(toast);
    
    // Add slide-in animation
    toast.style.animation = 'slideIn 0.5s ease-out';
    
    setTimeout(() => {
        toast.style.animation = 'slideOut 0.5s ease-in';
        setTimeout(() => {
            toast.remove();
        }, 450);
    }, 3000);
}

// Add CSS for animations
const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from {
            transform: translateX(100%);
            opacity: 0;
        }
        to {
            transform: translateX(0);
            opacity: 1;
        }
    }
    
    @keyframes slideOut {
        from {
            transform: translateX(0);
            opacity: 1;
        }
        to {
            transform: translateX(100%);
            opacity: 0;
        }
    }
    
    .toast {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 12px 20px;
        margin-bottom: 10px;
        border-radius: 8px;
        box-shadow: 0 2px 5px rgba(0,0,0,0.2);
        background: white;
        color: #333;
        font-weight: 500;
    }
    
    .toast.success {
        background: #e8f5e9;
        border-left: 4px solid #4caf50;
    }
    
    .toast.error {
        background: #fbe9e7;
        border-left: 4px solid #f44336;
    }
    
    .toast i {
        font-size: 1.2em;
    }
    
    .toast.success i {
        color: #4caf50;
    }
    
    .toast.error i {
        color: #f44336;
    }
`;
document.head.appendChild(style);

// Add new styles for the navigation buttons
const navStyle = document.createElement('style');
navStyle.textContent = `
    .quick-actions {
        display: flex;
        gap: 15px;
        flex-wrap: wrap;
        align-items: center;
        justify-content: flex-start;
        position: relative;
    }

    .settings-btn {
        margin-left: auto;
    }

    .logout-btn {
        background: #ff4444;
        transition: all 0.3s ease;
    }

    .logout-btn:hover {
        background: #ff6666;
        color: var(--text-light);
    }

    @media (max-width: 768px) {
        .quick-actions {
            flex-direction: column;
            align-items: stretch;
        }

        .settings-btn {
            margin-left: 0;
        }
    }
`;
document.head.appendChild(navStyle);