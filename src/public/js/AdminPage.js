const socket=io('ws://localhost:3000')
let adminName = '';
let adminId = null;

// Show toast notifications
function showToast(message, type = 'success') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerText = message;

    document.getElementById('toast-container').appendChild(toast);

    setTimeout(() => {
        toast.classList.add('hide');
        toast.addEventListener('transitionend', () => {toast.remove()});
    }, 2000);
}

// Fetch admin information
fetch('/admin-info')
    .then(response => {
        if (!response.ok) throw new Error('Unauthorized');
        return response.json();
    })
    .then(data => {
        adminName = data.name;
        document.getElementById('admin-name').textContent = data.name;

        document.addEventListener("click", () => resetInactivityTimer(data.id));
        document.addEventListener("keydown", () => resetInactivityTimer(data.id));
        socket.emit("userOnline", data.id);
        
        if (data.role === "user" && window.location.pathname !== "/UserDashboard.html") {
            window.location.href = "/UserDashboard.html";
        }
        
        // Load teams
        fetchTeamsWithMembers();
        fetchTeamsIAmMemberOf();
    })
    .catch(() => window.location.href = '/Login-Form.html');

// Create Team Form
document.getElementById("createTeamForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const teamName = document.getElementById("teamName").value;

    if (!teamName.trim()) {
        showToast("Please enter a team name", "error");
        return;
    }

    fetch("/create-team", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teamName }),
    })
    .then(response => response.json())
    .then(data => {
        if (data.error) {
            showToast(data.error, 'error');
        } else {
            showToast("Team created successfully!");
            document.getElementById("teamName").value = '';
            setTimeout(fetchTeamsWithMembers, 500);
        }
    })
    .catch(err => {
        console.error("Error creating team:", err);
        showToast("Failed to create team", "error");
    });
});

// Modal handling functions
function openModal(modalId) {
    document.getElementById(modalId).style.display = 'block';
    document.body.style.overflow = 'hidden'; // Prevent scrolling while modal is open
}

function closeModal(modalId) {
    document.getElementById(modalId).style.display = 'none';
    document.body.style.overflow = 'auto'; // Re-enable scrolling
}

// Add event listeners to close buttons
document.querySelectorAll('.close-modal').forEach(button => {
    button.addEventListener('click', () => {
        const modal = button.closest('.modal');
        closeModal(modal.id);
    });
});

// Close modal if user clicks outside the modal content
window.addEventListener('click', (e) => {
    document.querySelectorAll('.modal').forEach(modal => {
        if (e.target === modal) {
            closeModal(modal.id);
        }
    });
});

// Add Member Form (Modal)
document.getElementById('add-member-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const teamId = document.getElementById('modalTeamId').value;
    const userName = document.getElementById('modalUserName').value;

    if (!userName || !teamId) {
        showToast("Please enter a username", "error");
        return;
    }

    fetch("/assign-user-to-team", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userName, teamId }),
    })
    .then(response => response.json())
    .then(data => {
        if (data.error) {
            showToast(data.error, 'error');
        } else {
            showToast("User added to team successfully!");
            closeModal('add-member-modal');
            document.getElementById('modalUserName').value = '';
            setTimeout(fetchTeamsWithMembers, 500);
        }
    })
    .catch(err => {
        console.error("Error adding user to team:", err);
        showToast("Failed to add user to team", "error");
    });
});

// Create Channel Form (Modal)
document.getElementById('modal-create-channel-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const teamId = document.getElementById('modalChannelTeamId').value;
    const channelName = document.getElementById('modalChannelName').value;

    if (!channelName || !teamId) {
        showToast("Please enter a channel name", "error");
        return;
    }

    fetch('/create-channel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelName, teamId }),
    })
    .then(response => response.json())
    .then(data => {
        if (data.error) {
            showToast(data.error, 'error');
        } else {
            showToast("Channel created successfully!");
            closeModal('create-channel-modal');
            document.getElementById('modalChannelName').value = '';
            setTimeout(fetchTeamsWithMembers, 500);
        }
    })
    .catch(err => {
        console.error('Error creating channel:', err);
        showToast("Failed to create channel", "error");
    });
});

// Fetch and display teams owned by admin
function fetchTeamsWithMembers() {
    fetch('/get-teams-with-members')
        .then(response => response.json())
        .then(teams => {
            const teamsContainer = document.getElementById('teams-container');
            teamsContainer.innerHTML = '';

            // Fetch admin info to show only teams created by this admin
            fetch('/admin-info')
                .then(response => response.json())
                .then(adminData => {
                    // Filter teams where admin is the creator
                    const ownedTeams = teams.filter(team => team.creatorName === adminData.name);

                    if (ownedTeams.length === 0) {
                        teamsContainer.innerHTML = '<p>You haven\'t created any teams yet. Use the form above to create your first team.</p>';
                        return;
                    }

                    ownedTeams.forEach(team => {
                        const teamCard = createTeamCard(team, true);
                        teamsContainer.appendChild(teamCard);
                    });
                });
        })
        .catch(err => {
            console.error('Error fetching teams:', err);
            const teamsContainer = document.getElementById('teams-container');
            teamsContainer.innerHTML = '<p>Error loading teams. Please try again later.</p>';
        });
}

// Fetch and display teams where admin is a member but not creator
function fetchTeamsIAmMemberOf() {
    fetch('/get-user-teams')
        .then(response => response.json())
        .then(teams => {
            const memberTeamsContainer = document.getElementById('member-teams-container');
            memberTeamsContainer.innerHTML = '';

            if (!teams || teams.length === 0) {
                memberTeamsContainer.innerHTML = '<p>You are not a member of any additional teams.</p>';
                return;
            }

            fetch('/admin-info')
                .then(response => response.json())
                .then(adminData => {
                    // Filter out teams created by this admin
                    const memberTeams = teams.filter(team => team.creatorName !== adminData.name);

                    if (memberTeams.length === 0) {
                        memberTeamsContainer.innerHTML = '<p>You are not a member of any additional teams.</p>';
                        return;
                    }

                    memberTeams.forEach(team => {
                        const teamCard = createTeamCard(team, false);
                        memberTeamsContainer.appendChild(teamCard);
                    });
                });
        })
        .catch(err => {
            console.error('Error fetching user teams:', err);
            const memberTeamsContainer = document.getElementById('member-teams-container');
            memberTeamsContainer.innerHTML = '<p>Error loading teams. Please try again later.</p>';
        });
}

// Create a team card with enhanced UI
function createTeamCard(team, isOwner) {
    const teamDiv = document.createElement('div');
    teamDiv.classList.add('team-card');
    
    // Team header
    const teamHeader = document.createElement('div');
    teamHeader.classList.add('team-header');
    
    const teamTitle = document.createElement('h3');
    teamTitle.innerHTML = `${team.teamName} <small style="color: #888;">(ID: ${team.teamId})</small>`;
    
    const createdBy = document.createElement('p');
    createdBy.innerHTML = `<strong>Created by:</strong> ${team.creatorName || 'Unknown'}`;
    
    teamHeader.appendChild(teamTitle);
    teamDiv.appendChild(teamHeader);
    teamDiv.appendChild(createdBy);

    // Members section
    const membersList = document.createElement('div');
    membersList.classList.add('team-members');
    membersList.innerHTML = `<strong>Members:</strong> `;
    
    if (team.members && team.members.length > 0) {
        const memberList = document.createElement('div');
        memberList.classList.add('member-list');
        
        team.members.forEach(member => {
            const memberItem = document.createElement('div');
            memberItem.classList.add('member-item');
            memberItem.innerHTML = `
                <span class="member-name">${member}</span>
                ${isOwner && member !== team.creatorName ? 
                    `<button class="remove-member" title="Remove member"><i class="fas fa-times"></i></button>` : 
                    ''}
            `;
            
            if (isOwner && member !== team.creatorName) {
                const removeBtn = memberItem.querySelector('.remove-member');
                removeBtn.addEventListener('click', () => removeMemberFromTeam(team.teamId, member));
            }
            
            memberList.appendChild(memberItem);
        });
        
        membersList.appendChild(memberList);
    } else {
        membersList.innerHTML += 'No members yet';
    }
    
    teamDiv.appendChild(membersList);
    
    // Channels section
    const channelContainer = document.createElement('div');
    channelContainer.classList.add('channel-container');
    
    const channelHeader = document.createElement('h4');
    channelHeader.innerHTML = '<i class="fas fa-hashtag"></i> Channels';
    channelContainer.appendChild(channelHeader);

    if (team.channels && Object.keys(team.channels).length > 0) {
        Object.values(team.channels).forEach(channel => {
            const channelDiv = document.createElement('div');
            channelDiv.classList.add('channel-item');

            const channelHeader = document.createElement('div');
            channelHeader.classList.add('channel-header');
            
            const channelName = document.createElement('div');
            channelName.innerHTML = `<strong># ${channel.channelName}</strong>`;
            channelName.style.marginBottom = '5px';
            
            channelHeader.appendChild(channelName);
            
            // Add member button for channel
            if (isOwner) {
                const addChannelMemberBtn = document.createElement('button');
                addChannelMemberBtn.classList.add('add-channel-member-btn');
                addChannelMemberBtn.innerHTML = '<i class="fas fa-user-plus"></i>';
                addChannelMemberBtn.title = 'Add Member to Channel';
                addChannelMemberBtn.addEventListener('click', () => {
                    document.getElementById('modalAddChannelTeamId').value = team.teamId;
                    document.getElementById('modalAddChannelName').value = channel.channelName;
                    openModal('add-channel-member-modal');
                });
                channelHeader.appendChild(addChannelMemberBtn);
            }
            
            channelDiv.appendChild(channelHeader);
            
            const channelMembersList = document.createElement('div');
            channelMembersList.style.fontSize = '0.9rem';
            channelMembersList.classList.add('channel-members-list');
            if (channel.members && channel.members.length > 0) {
                channelMembersList.innerHTML = `<span style="color: #888;">Members:</span> ${channel.members.join(', ')}`;
            } else {
                channelMembersList.innerHTML = `<span style="color: #888;">Members:</span> No members`;
            }

            channelDiv.appendChild(channelMembersList);
            channelContainer.appendChild(channelDiv);
        });
    } else {
        const noChannelsMsg = document.createElement('p');
        noChannelsMsg.textContent = 'No channels available';
        noChannelsMsg.style.fontStyle = 'italic';
        noChannelsMsg.style.color = '#888';
        channelContainer.appendChild(noChannelsMsg);
    }
    
    teamDiv.appendChild(channelContainer);
    
    // Action buttons
    const actionButtons = document.createElement('div');
    actionButtons.classList.add('team-actions');
    
    // Open chat button
    const openChatButton = document.createElement('button');
    openChatButton.classList.add('action-btn', 'primary');
    openChatButton.innerHTML = '<i class="fas fa-comments"></i> Open Team Chat';
    openChatButton.addEventListener('click', () => {
        window.location.href = `channel_chat.html?team=${encodeURIComponent(team.teamName)}`;
    });
    actionButtons.appendChild(openChatButton);
    
    if (isOwner) {
        // Add member button
        const addMemberButton = document.createElement('button');
        addMemberButton.classList.add('action-btn', 'secondary');
        addMemberButton.innerHTML = '<i class="fas fa-user-plus"></i> Add Member';
        addMemberButton.addEventListener('click', () => {
            document.getElementById('modalTeamId').value = team.teamId;
            openModal('add-member-modal');
        });
        actionButtons.appendChild(addMemberButton);
        
        // Create channel button
        const createChannelButton = document.createElement('button');
        createChannelButton.classList.add('action-btn', 'secondary');
        createChannelButton.innerHTML = '<i class="fas fa-plus"></i> Create Channel';
        createChannelButton.addEventListener('click', () => {
            document.getElementById('modalChannelTeamId').value = team.teamId;
            openModal('create-channel-modal');
        });
        actionButtons.appendChild(createChannelButton);
        
        // Delete team button
        const deleteTeamButton = document.createElement('button');
        deleteTeamButton.classList.add('action-btn', 'danger');
        deleteTeamButton.innerHTML = '<i class="fas fa-trash"></i> Delete Team';
        deleteTeamButton.addEventListener('click', () => deleteTeam(team.teamId, team.teamName));
        actionButtons.appendChild(deleteTeamButton);
    }
    
    teamDiv.appendChild(actionButtons);
    
    return teamDiv;
}

// Function to delete a team
function deleteTeam(teamId, teamName) {
    if (!confirm(`Are you sure you want to delete team "${teamName}"? This will delete all channels and messages in this team and cannot be undone.`)) {
        return;
    }

    fetch('/delete-team', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teamId }),
    })
    .then(response => response.json())
    .then(data => {
        if (data.error) {
            showToast(data.error, 'error');
        } else {
            showToast(data.message || 'Team deleted successfully!');
            setTimeout(() => {
                fetchTeamsWithMembers();
            }, 500);
        }
    })
    .catch(err => {
        console.error('Error deleting team:', err);
        showToast('An error occurred while deleting the team.', 'error');
    });
}

// Function to remove a member from a team
function removeMemberFromTeam(teamId, userName) {
    if (!confirm(`Are you sure you want to remove "${userName}" from this team? They will lose access to all channels in this team.`)) {
        return;
    }

    // First get the user ID from the username
    fetch(`/get-user-id?username=${encodeURIComponent(userName)}`)
        .then(response => response.json())
        .then(userData => {
            if (userData.error) {
                showToast(userData.error, 'error');
                return;
            }

            const userId = userData.userId;

            // Now remove the user from the team
            fetch('/remove-team-member', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ teamId, userId }),
            })
            .then(response => response.json())
            .then(data => {
                if (data.error) {
                    showToast(data.error, 'error');
                } else {
                    showToast(data.message || 'User removed from team successfully!');
                    setTimeout(() => {
                        fetchTeamsWithMembers();
                    }, 500);
                }
            })
            .catch(err => {
                console.error('Error removing member from team:', err);
                showToast('An error occurred while removing the member.', 'error');
            });
        })
        .catch(err => {
            console.error('Error getting user ID:', err);
            showToast('An error occurred while getting user information.', 'error');
        });
}

// User status management
socket.on("updateUserStatus", ({ online,online_names, away,away_names  }) => {
    console.log(online,online_names)
    fetch("/api/users") 
        .then(response => response.json())
        .then(data => {
            updateUserStatusUI(data.all_users, online_names, away_names, data.user_logout_times);
            console.log(online,online_names, away,away_names)
        });
});
        
function updateUserStatusUI(allUsers, onlineUsers, awayUsers, logoutTimes) {
    const usersStatusDiv = document.getElementById("users-status");
    usersStatusDiv.innerHTML = "";

    // Add header
    
    const statusHeader = document.createElement('div');
    statusHeader.classList.add('status-header');
    statusHeader.innerHTML = `<h3>All Users (${allUsers.length})</h3>`;
    usersStatusDiv.appendChild(statusHeader);
    const online = onlineUsers || [];
    const away=awayUsers|| [];
    // Sort users: online first, then away, then offline
    // Within each status category, sort admins first
    allUsers.sort((a, b) => {
       console.log(onlineUsers)
       console.log(awayUsers)
        const aIsOnline = online.includes(a.name);
        const bIsOnline = online.includes(b.name);
        const aIsAway = away.includes(a.name);
        const bIsAway = away.includes(b.name);
        
        if (aIsOnline && !bIsOnline) return -1;
        if (!aIsOnline && bIsOnline) return 1;
        if (aIsAway && !bIsAway) return -1;
        if (!aIsAway && bIsAway) return 1;
        
        // If same status, sort by role (admin first)
        if (a.role === 'admin' && b.role !== 'admin') return -1;
        if (a.role !== 'admin' && b.role === 'admin') return 1;
        
        // If same role, sort alphabetically
        return a.name.localeCompare(b.name);
    });

    allUsers.forEach(user => {
        const isOnline = online.includes(user.name);
        const isAway = away.includes(user.name);
        const isCurrentUser = user.name === adminName;

        const userDiv = document.createElement("div");
        userDiv.classList.add("user-status");
        if (isCurrentUser) {
            userDiv.classList.add("current-user");
        }

        let statusText = "Offline";
        let statusClass = "offline";
        let logoutTimestamp = "";
        let statusIcon = `<i class="fas fa-circle-xmark offline-icon"></i>`; // default offline

        if (isOnline) {
            statusText = "Available";
            statusClass = "online";
            statusIcon = `<i class="fas fa-circle-check online-icon"></i>`;
        } else if (isAway) {
            statusText = "Away";
            statusClass = "away";
            statusIcon = `<i class="fas fa-clock away-icon"></i>`;
        } else {
            // Get last logout timestamp for this user
            const userLogout = logoutTimes.find(logout => logout.name === user.name);
            if (userLogout && userLogout.last_logout) {
                logoutTimestamp = `<div class="timestamp">Last seen: ${new Date(userLogout.last_logout).toLocaleString()}</div>`;
            }
        }

        // Format registration date if available
        let registrationInfo = '';
        if (user.created_at) {
            registrationInfo = `<div class="timestamp">Registered: ${new Date(user.created_at).toLocaleString()}</div>`;
        }

        userDiv.innerHTML = `
            <div class="user-status-info">
                <div class="user-name-role">
                    <span class="user-name">${user.name} ${isCurrentUser ? '(You)' : ''}</span>
                    <span class="user-role ${user.role === 'admin' ? 'role-admin' : 'role-user'}">
                        ${user.role === 'admin' ? 'Moderator' : 'User'}
                    </span>
                </div>
                <div class="status ${statusClass}">
                    ${statusIcon} ${statusText}
                </div>
                ${registrationInfo}
                ${logoutTimestamp}
            </div>
            <div class="user-status-actions">
                ${!isCurrentUser ? `
                <button class="status-dm-btn" title="Send Direct Message" data-user-id="${user.id}" data-user-name="${user.name}">
                    <i class="fas fa-envelope"></i>
                </button>
                ` : ''}
            </div>
        `;

        // Add event listeners for buttons
        if (!isCurrentUser) {
            // Direct message button
            const dmBtn = userDiv.querySelector('.status-dm-btn');
            if (dmBtn) {
                dmBtn.addEventListener('click', () => {
                    showSendDirectMessageModal(user);
                });
            }
        }

        usersStatusDiv.appendChild(userDiv);
    });
}

// Function to show direct message modal
function showSendDirectMessageModal(user) {
    // If we already have the modal from HTML, use it
    let dmModal = document.getElementById('dm-user-modal');
    
    // If not, create the modal dynamically
    if (!dmModal) {
        dmModal = document.createElement('div');
        dmModal.id = 'dm-user-modal';
        dmModal.className = 'modal';
        
        dmModal.innerHTML = `
            <div class="modal-content">
                <span class="close-modal">&times;</span>
                <h3>Send Direct Message</h3>
                <form id="dm-user-form">
                    <input type="hidden" id="modalDmUserId">
                    <input type="text" id="modalDmUserName" disabled>
                    <textarea id="modalDmMessage" placeholder="Type your message..." required rows="4"></textarea>
                    <button type="submit" class="btn">Send Message</button>
                </form>
            </div>
        `;
        
        document.body.appendChild(dmModal);
        
        // Add event listener to close button
        const closeBtn = dmModal.querySelector('.close-modal');
        closeBtn.addEventListener('click', () => {
            dmModal.style.display = 'none';
        });
        
        // Add event listener for submit
        const form = dmModal.querySelector('#dm-user-form');
        form.addEventListener('submit', (e) => {
            e.preventDefault();
            const userId = document.getElementById('modalDmUserId').value;
            const userName = document.getElementById('modalDmUserName').value;
            const message = document.getElementById('modalDmMessage').value;
            
            if (!message.trim() || !userId) {
                showToast("Please enter a message", "error");
                return;
            }
            
            sendDirectMessage(userId, userName, message);
        });
        
        // Close when clicking outside
        window.addEventListener('click', (e) => {
            if (e.target === dmModal) {
                dmModal.style.display = 'none';
            }
        });
    }
    
    // Set user information and show modal
    document.getElementById('modalDmUserId').value = user.id;
    document.getElementById('modalDmUserName').value = user.name;
    document.getElementById('modalDmMessage').value = '';
    dmModal.style.display = 'block';
}

// Function to send direct message
function sendDirectMessage(userId, userName, message) {
    fetch('/send-direct-message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            receiverId: userId,
            message: message,
            senderId: adminId,
            senderName: adminName
        }),
    })
    .then(response => response.json())
    .then(data => {
        if (data.error) {
            showToast(data.error, 'error');
        } else {
            showToast(`Message sent to ${userName} successfully!`);
            const dmModal = document.getElementById('dm-user-modal');
            dmModal.style.display = 'none';
        }
    })
    .catch(err => {
        console.error('Error sending message:', err);
        showToast('Failed to send message', 'error');
    });
}

// Inactivity timer management
let inactivityTimer;
const INACTIVITY_TIME = 30000; 

function resetInactivityTimer(userId) {
    clearTimeout(inactivityTimer);
    socket.emit("userOnline", userId);
    inactivityTimer = setTimeout(() => {
        socket.emit("userAway", userId);
    }, INACTIVITY_TIME);
}

// Chat functionality
document.addEventListener("DOMContentLoaded", () => {
    const chatToggle = document.getElementById("chat-toggle");
    const chatContainer = document.getElementById("chat-container");
    const closeChat = document.getElementById("close-chat");
    const sendButton = document.getElementById("send");
    const messageInput = document.getElementById("message");
    const chatMessages = document.getElementById("chat-messages");
    const statusToggle = document.getElementById("status-toggle");
    const statusContainer = document.getElementById("status-container");
    const closeStatus = document.getElementById("close-status");

    // Add Channel Member form handler
    document.getElementById('add-channel-member-form').addEventListener('submit', (e) => {
        e.preventDefault();
        
        const teamId = document.getElementById('modalAddChannelTeamId').value;
        const channelName = document.getElementById('modalAddChannelName').value;
        const userName = document.getElementById('modalAddChannelMember').value;
        
        if (!userName.trim()) {
            showToast("Please enter a username", "error");
            return;
        }
        
        // Assign user to channel
        fetch('/assign-user', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                teamId: teamId,
                channelName: channelName,
                userName: userName
            }),
        })
        .then(response => response.json())
        .then(data => {
            if (data.error) {
                showToast(data.error, 'error');
            } else {
                showToast(`Added ${userName} to channel ${channelName} successfully!`);
                document.getElementById('modalAddChannelMember').value = '';
                document.getElementById('add-channel-member-modal').style.display = 'none';
                
                // Refresh the teams to show the updated channel members
                setTimeout(() => {
                    fetchTeamsWithMembers();
                }, 500);
            }
        })
        .catch(err => {
            console.error('Error assigning user to channel:', err);
            showToast('Failed to add user to channel', 'error');
        });
    });

    // Add to channel form handler
    document.getElementById('add-to-channel-form').addEventListener('submit', (e) => {
        e.preventDefault();
        
        const modalUserId = document.getElementById('modalChannelUserId').value;
        const channelSelectValue = document.getElementById('modalChannelSelect').value;
        
        if (!channelSelectValue) {
            showToast("Please select a channel", "error");
            return;
        }
        
        // Parse the channel data
        try {
            const channelData = JSON.parse(channelSelectValue);
            const teamId = channelData.teamId;
            const channelName = channelData.channelName;
            
            // First get the username from the user ID
            fetch(`/get-username?userId=${encodeURIComponent(modalUserId)}`)
                .then(response => response.json())
                .then(userData => {
                    if (userData.error) {
                        showToast(userData.error, 'error');
                        return;
                    }
                    
                    const userName = userData.userName;
                    
                    // Now assign the user to the channel
                    fetch('/assign-user', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            teamId: teamId,
                            channelName: channelName,
                            userName: userName
                        }),
                    })
                    .then(response => response.json())
                    .then(data => {
                        if (data.error) {
                            showToast(data.error, 'error');
                        } else {
                            showToast(`Added ${userName} to channel ${channelName} successfully!`);
                            document.getElementById('add-to-channel-modal').style.display = 'none';
                            
                            // Refresh the teams to show the updated channel members
                            setTimeout(fetchTeamsWithMembers, 500);
                        }
                    })
                    .catch(err => {
                        console.error('Error assigning user to channel:', err);
                        showToast('Failed to add user to channel', 'error');
                    });
                })
                .catch(err => {
                    console.error('Error getting username:', err);
                    showToast('Failed to get user information', 'error');
                });
        } catch (err) {
            console.error('Error parsing channel data:', err);
            showToast('Invalid channel selection', 'error');
        }
    });

    // Close modals when clicking on the close button
    document.querySelectorAll('.close-modal').forEach(button => {
        button.addEventListener('click', () => {
            const modal = button.closest('.modal');
            modal.style.display = 'none';
        });
    });

    // Close modals when clicking outside
    window.addEventListener('click', (e) => {
        document.querySelectorAll('.modal').forEach(modal => {
            if (e.target === modal) {
                modal.style.display = 'none';
            }
        });
    });

    // Toggle chat visibility
    chatToggle.addEventListener("click", () => {
        chatContainer.style.left = "0";
        chatToggle.style.display = "none"; 
        statusToggle.style.display = "none";
    });

    closeChat.addEventListener("click", () => {
        chatContainer.style.left = "-700px";
        setTimeout(() => {
            chatToggle.style.display = "block";  
            statusToggle.style.display = "block";
        }, 300);
    });

    statusToggle.addEventListener("click", () => {
        statusContainer.style.left = "0";
        chatToggle.style.display = "none"; 
        statusToggle.style.display = "none";
    });

    closeStatus.addEventListener("click", () => {
        statusContainer.style.left = "-300px";
        setTimeout(() => {
            chatToggle.style.display = "block";  
            statusToggle.style.display = "block";
        }, 300);
    });

    // Request global chat history when connecting
    socket.on('connect', () => {
        socket.emit('join', 'global-chat');
    });

    // Get global chat history when page loads
    socket.on('global-chat-history', (messages) => {
        chatMessages.innerHTML = '';
        messages.forEach(message => appendMessage(message));
        chatMessages.scrollTop = chatMessages.scrollHeight;
    });

    // Send message
    sendButton.addEventListener("click", () => {
        sendMessage();
    });

    messageInput.addEventListener("keypress", (e) => {
        if (e.key === "Enter") {
            sendMessage();
            e.preventDefault();
        }
    });

    let loggedInUser;
    let loggedInUserId;
    let loggedInUserRole;

    // Get current user info
    fetch('/user-info')
        .then(response => {
            if (!response.ok) throw new Error('Unauthorized');
            return response.json();
        })
        .then(data => {
            loggedInUser = data.name;
            loggedInUserId = data.id;
            loggedInUserRole = data.role;
            adminId = data.id;
        })
        .catch(() => window.location.href = '/Login-Form.html');

    // Send message to global chat
    function sendMessage() {
        const input = document.getElementById("message");
        const message = input.value.trim();
        
        if (message) {
            // Prepare the message data
            const messageData = {
                text: message,
                timestamp: new Date(),
                sender_id: loggedInUserId || adminId,
                sender_name: loggedInUser || adminName
            };
            
            // Send to server using global-message event
            socket.emit('global-message', messageData);
            
            // Clear input
            input.value = '';
            input.focus();
        }
    }

    // Handle incoming global messages
    socket.on("global-message", (message) => {
        appendMessage(message);
    });

    // Listen for global message removal events
    socket.on('global-message-removed', (data) => {
        const messageId = data.id;
        const messageElements = document.querySelectorAll('[data-message-id]');
        
        messageElements.forEach(element => {
            if (element.dataset.messageId === messageId.toString()) {
                const messageText = element.querySelector('.message-text');
                if (messageText) {
                    messageText.textContent = 'Removed by Moderator';
                    messageText.classList.add('removed-message');
                    
                    // Add moderator flag
                    const messageContent = element.querySelector('.message-content');
                    if (messageContent && !messageContent.querySelector('.moderator-flag')) {
                        const moderatorFlag = document.createElement('div');
                        moderatorFlag.className = 'moderator-flag';
                        moderatorFlag.innerHTML = '<i class="fas fa-shield-alt"></i> Moderated';
                        messageContent.appendChild(moderatorFlag);
                    }
                } else {
                    element.textContent = 'Removed by Moderator';
                    element.classList.add('removed-message');
                }
                
                // Remove any delete buttons
                const deleteBtn = element.querySelector('.delete-btn');
                if (deleteBtn) {
                    deleteBtn.remove();
                }
            }
        });
    });

    // Function to append a message to the chat
    function appendMessage(message) {
        const messageDiv = document.createElement('div');
        const isMyMessage = message.sender_id === (loggedInUserId || adminId);
        const isAdmin = loggedInUserRole === "admin" || true; // For admin page, always true
        
        messageDiv.className = `message-container ${isMyMessage ? 'right' : 'left'}`;
        messageDiv.dataset.messageId = message.id;
        
        const time = new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        
        // Handle both message formats from different sources
        const messageText = message.message || message.text;
        const isModerated = messageText === 'Removed by Moderator' || messageText === 'Removed by Admin';
        
        messageDiv.innerHTML = `
            <div class="message ${isMyMessage ? 'sent' : 'received'} ${message.quoted_text ? 'has-quote' : ''}">
                ${!isMyMessage ? `<div class="sender-name">${message.sender_name}</div>` : ''}
                <div class="message-content">
                    ${message.quoted_text ? `
                        <div class="quoted-message">
                            <div class="quoted-sender">Replying to ${message.quoted_sender}</div>
                            <div class="quoted-text">${message.quoted_text}</div>
                        </div>
                    ` : ''}
                    <div class="message-text ${isModerated ? 'removed-message' : ''}">${messageText}</div>
                    <div class="message-time">${time}</div>
                    ${!isModerated && isAdmin ? `
                        <button class="delete-btn" title="Delete message">
                            <i class="fas fa-trash"></i>
                        </button>
                    ` : ''}
                    ${isModerated ? `
                        <div class="moderator-flag">
                            <i class="fas fa-shield-alt"></i> Moderated
                        </div>
                    ` : ''}
                </div>
            </div>
        `;
        
        // Add delete functionality for admin
        if (isAdmin && !isModerated) {
            const deleteBtn = messageDiv.querySelector('.delete-btn');
            if (deleteBtn) {
                deleteBtn.addEventListener('click', () => {
                    deleteGlobalMessage(message.id, messageDiv);
                });
            }
        }
        
        chatMessages.appendChild(messageDiv);
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    // Function to delete a global message (admin only)
    function deleteGlobalMessage(messageId, messageElement) {
        fetch('/remove-global-message', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ messageId: messageId })
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                const messageText = messageElement.querySelector('.message-text');
                if (messageText) {
                    messageText.textContent = 'Removed by Moderator';
                    messageText.classList.add('removed-message');
                    
                    // Add moderator flag if not already there
                    const messageContent = messageElement.querySelector('.message-content');
                    if (messageContent && !messageContent.querySelector('.moderator-flag')) {
                        const moderatorFlag = document.createElement('div');
                        moderatorFlag.className = 'moderator-flag';
                        moderatorFlag.innerHTML = '<i class="fas fa-shield-alt"></i> Moderated';
                        messageContent.appendChild(moderatorFlag);
                    }
                }
                
                // Remove delete button
                const deleteBtn = messageElement.querySelector('.delete-btn');
                if (deleteBtn) {
                    deleteBtn.remove();
                }
                
                showToast('Message removed successfully', 'success');
            } else {
                showToast('Failed to remove message: ' + (data.error || 'Unknown error'), 'error');
            }
        })
        .catch(error => {
            console.error('Error:', error);
            showToast('Failed to remove message', 'error');
        });
    }

    // Emoji picker functionality
    document.getElementById("emoji-btn").addEventListener("click", function (event) {
        event.stopPropagation(); 

        const pickerContainer = document.getElementById("emoji-picker-container");

        if (pickerContainer.style.display === "none" || pickerContainer.innerHTML === "") {
            pickerContainer.style.display = "block";
            pickerContainer.innerHTML = "";

            const picker = new EmojiMart.Picker({
                set: 'apple',
                onEmojiSelect: (emoji) => {
                    const messageInput = document.getElementById("message");
                    messageInput.value += emoji.native || emoji.colons || emoji.id;
                    pickerContainer.style.display = "none"; 
                }
            });

            pickerContainer.appendChild(picker);
        } else {
            pickerContainer.style.display = "none";
        }
    });

    document.addEventListener("click", function (event) {
        const pickerContainer = document.getElementById("emoji-picker-container");
        const emojiButton = document.getElementById("emoji-btn");

        if (
            pickerContainer.style.display === "block" &&
            !pickerContainer.contains(event.target) &&
            event.target !== emojiButton
        ) {
            pickerContainer.style.display = "none";
        }
    });

    // AI Chat functionality
    const chatFrame = document.getElementById("ai-chat-frame");
    const chatLauncher = document.getElementById("ai-chat-launcher");

    chatLauncher.addEventListener("click", () => {
        const isVisible = chatFrame.style.display === "block";
        chatFrame.classList.add('fade-in');
        chatFrame.style.display = isVisible ? "none" : "block";
    });
});

// Function to show add to channel modal
function showAddToChannelModal(user) {
    // Reset the form and populate with user data
    const modalUserId = document.getElementById('modalChannelUserId');
    const modalChannelSelect = document.getElementById('modalChannelSelect');
    
    modalUserId.value = user.id;
    modalChannelSelect.innerHTML = '<option value="">Loading channels...</option>';
    
    // Fetch all teams and their channels
    fetch('/get-teams-with-members')
        .then(response => response.json())
        .then(teams => {
            modalChannelSelect.innerHTML = '<option value="">Select a channel</option>';
            
            // Filter teams where the admin is the owner
            const ownedTeams = teams.filter(team => team.creatorName === adminName);
            
            if (ownedTeams.length === 0) {
                modalChannelSelect.innerHTML = '<option value="">No channels available</option>';
                return;
            }
            
            // Add options for each channel
            ownedTeams.forEach(team => {
                if (team.channels && Object.keys(team.channels).length > 0) {
                    // Create optgroup for team
                    const optgroup = document.createElement('optgroup');
                    optgroup.label = `Team: ${team.teamName}`;
                    
                    // Add each channel
                    Object.values(team.channels).forEach(channel => {
                        const option = document.createElement('option');
                        option.value = JSON.stringify({
                            teamId: team.teamId,
                            channelName: channel.channelName
                        });
                        option.textContent = channel.channelName;
                        
                        // Check if user is already a member
                        if (channel.members && channel.members.includes(user.name)) {
                            option.disabled = true;
                            option.textContent += ' (Already a member)';
                        }
                        
                        optgroup.appendChild(option);
                    });
                    
                    modalChannelSelect.appendChild(optgroup);
                }
            });
            
            // Show the modal
            document.getElementById('add-to-channel-modal').style.display = 'block';
        })
        .catch(err => {
            console.error('Error fetching teams:', err);
            modalChannelSelect.innerHTML = '<option value="">Error loading channels</option>';
            document.getElementById('add-to-channel-modal').style.display = 'block';
        });
}