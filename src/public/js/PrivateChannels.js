const socket = io();
        let loggedInUserId = null;
        let loggedInUserName = "";
        let onlineUsers = [];
        let awayUsers = [];
        let currentGroupId = null;
        let isPageLoading = true;

        // Initialize for page load
        document.addEventListener('DOMContentLoaded', function() {
            isPageLoading = true;
            console.log("Page loading, initializing state...");
            
            // Socket connection management
            socket.on('connect', function() {
                console.log('Socket connected');
            });
            
            socket.on('disconnect', function() {
                console.log('Socket disconnected');
                // Try to reconnect if disconnected
                setTimeout(() => {
                    if (socket.disconnected) {
                        socket.connect();
                    }
                }, 2000);
            });
            
            // Create a helper function to reset state when navigating
            window.resetChannelState = function() {
                // Remove all active socket listeners for current group
                if (currentGroupId) {
                    socket.off(`group-message-${currentGroupId}`);
                }
                
                // Clear currentGroupId
                currentGroupId = null;
                
                // Clear UI active states
                document.querySelectorAll('#group-list li').forEach(li => {
                    li.classList.remove('active');
                });
                
                // Clear URL params
                history.pushState(null, '', window.location.pathname);
            };
            
            // Fetch logged-in user info
            fetch('/user-info')
                .then(response => response.json())
                .then(data => {
                    loggedInUserId = data.id;
                    loggedInUserName = data.name;
                    fetchGroups();
                    
                    // Request initial status update when page loads
                    socket.emit("requestStatusUpdate");
                    
                    // Update user's online status
                    socket.emit("userOnline", loggedInUserId);
                    
                    isPageLoading = false;
                    console.log("Page loaded, initialization complete");
                })
                .catch((err) => {
                    console.error("Error during initialization:", err);
                    window.location.href = '/Login-Form.html';
                });
        });

        // Fix for channel switching - ensure sidebar stays active
        document.getElementById("back-btn").addEventListener("click", () => {
            // Clean up socket connections and state before navigating away
            if (currentGroupId) {
                socket.off(`group-message-${currentGroupId}`);
                currentGroupId = null;
            }
            
            fetch('/user-info')
                .then(response => response.json())
                .then(data => {
                    window.location.href = data.role === "admin" ? "/AdminDashboard.html" : "/UserDashboard.html"; 
                })
                .catch(() => window.location.href = "/UserDashboard.html");
        });

        // Create channel button in empty state
        document.getElementById("create-empty-btn").addEventListener("click", () => {
            createNewChannel();
        });

        // Check for group ID in URL params
        const urlParams = new URLSearchParams(window.location.search);
        const groupIdFromUrl = urlParams.get('id');

        // User status listeners
        socket.on("updateUserStatus", function(data) {
            onlineUsers = data.online.map(id => parseInt(id));
            awayUsers = data.away.map(id => parseInt(id));
            
            // If a group is loaded, update the members list to show statuses
            if (currentGroupId) {
                updateMembersWithStatus();
            }
        });

        // Function to update members list with status indicators
        function updateMembersWithStatus() {
            const memberItems = document.querySelectorAll('#member-list li');
            memberItems.forEach(item => {
                const userId = parseInt(item.dataset.userId);
                if (!userId) return;
                
                // Remove existing status classes
                item.querySelector('.user-status')?.remove();
                
                // Add status indicator
                const statusIndicator = document.createElement('span');
                statusIndicator.className = 'user-status';
                
                if (onlineUsers.includes(userId)) {
                    statusIndicator.classList.add('status-online');
                    statusIndicator.title = 'Online';
                } else if (awayUsers.includes(userId)) {
                    statusIndicator.classList.add('status-away');
                    statusIndicator.title = 'Away';
                } else {
                    statusIndicator.classList.add('status-offline');
                    statusIndicator.title = 'Offline';
                }
                
                item.insertBefore(statusIndicator, item.firstChild);
            });
        }

        // Fetch groups
        function fetchGroups() {
            fetch("/get-groups")
                .then(response => response.json())
                .then(groups => handleGroupsSuccess(groups))
                .catch(err => handleGroupsError(err));
        }
        
        function handleGroupsSuccess(groups) {
            const groupList = document.getElementById("group-list");
            groupList.innerHTML = "";
        
            if (groups.length === 0) {
                renderEmptyState();
                return;
            }
        
            document.getElementById("empty-state").style.display = "none";
            currentGroupId = null;
        
            groups.forEach(group => {
                const groupItem = createGroupItem(group);
                groupList.appendChild(groupItem);
            });
        
            if (groupIdFromUrl) {
                loadGroupFromUrl(groupIdFromUrl);
            }
        }
        
        function renderEmptyState() {
            const groupList = document.getElementById("group-list");
            groupList.innerHTML = `
                <li class="empty-group-list">
                    <em>No private channels found.</em>
                </li>
            `;
            document.getElementById("empty-state").style.display = "flex";
        }
        
        function createGroupItem(group) {
            const groupItem = document.createElement("li");
            groupItem.innerHTML = `<i class="fas fa-users-rectangle"></i> <strong>${group.name}</strong>`;
            groupItem.dataset.groupId = group.id;
            groupItem.dataset.groupName = group.name;
            groupItem.dataset.groupDescription = group.description || "";
        
            groupItem.addEventListener("click", (e) => {
                e.preventDefault();
                handleGroupClick(group);
            });
        
            return groupItem;
        }
        
        function handleGroupClick(group) {
            const clickedGroupId = parseInt(group.id) || group.id;
            console.log(`Clicked on group: ${clickedGroupId}, current group: ${currentGroupId}`);
        
            document.querySelectorAll('#group-list li').forEach(li => li.classList.remove('active'));
        
            const groupItem = document.querySelector(`#group-list li[data-group-id="${group.id}"]`);
            groupItem?.classList.add('active');
        
            if (currentGroupId) {
                socket.off(`group-message-${currentGroupId}`);
            }
        
            loadGroup(clickedGroupId, group.name, group.description);
        
            const newUrl = window.location.pathname + '?id=' + clickedGroupId;
            history.pushState(null, '', newUrl);
        }
        
        function loadGroupFromUrl(groupIdFromUrl) {
            const groupItem = document.querySelector(`#group-list li[data-group-id="${groupIdFromUrl}"]`);
            if (groupItem) {
                groupItem.classList.add('active');
                loadGroup(groupIdFromUrl, groupItem.querySelector('strong').textContent, '');
            }
        }
        
        function handleGroupsError(err) {
            console.error("Error fetching groups:", err);
            document.getElementById("group-list").innerHTML = `
                <li class="error-state">
                    <i class="fas fa-exclamation-circle"></i> Error loading groups
                </li>
            `;
        }
        

        // Create a new group
        function createNewChannel() {
            const groupName = prompt("Enter private channel name:");
            if (!groupName) return;
        
            const groupDescription = prompt("Enter description (interests, topic, etc.):");
            if (!groupDescription) return;
        
            fetch("/create-group", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name: groupName, description: groupDescription })
            })
                .then(response => response.json())
                .then(data => {
                    if (data.error) {
                        alert(data.error);
                        return;
                    }
        
                    alert(data.message);
                    fetchGroups();
        
                    setTimeout(() => {
                        document.querySelector(`#group-list li[data-group-id="${data.groupId}"]`)?.click();
                    }, 300);
                })
                .catch(error => console.error("Error creating group:", error));
        }
        
        document.getElementById("create-group-btn").addEventListener("click", createNewChannel);
        
        function loadGroup(groupId, groupName, groupDescription) {
            console.log(`Loading group: ${groupId} - ${groupName}`);
        
            if (currentGroupId && currentGroupId !== groupId) {
                socket.off(`group-message-${currentGroupId}`);
            }
        
            currentGroupId = groupId;
        
            document.getElementById("empty-state")?.style.setProperty('display', 'none');
        
            setupChatUI(groupName, groupDescription);
            addMessageInputEvents(groupId);
            fetchAndRenderGroupOwner(groupId, groupDescription);
        }
        
        function setupChatUI(groupName, groupDescription) {
            const chatWindow = document.querySelector(".chat-window");
            chatWindow.innerHTML = `
                <div id="chat-header"><strong>Private Channel: ${groupName}</strong></div>
                <div class="channel-layout">
                    <div class="channel-info-panel">
                        <div id="group-details">
                            <h3>${groupName}</h3>
                            <p class="group-description">${groupDescription || "No description available"}</p>
                            <h4>Members</h4>
                            <ul id="member-list">Loading members...</ul>
                        </div>
                        <div id="owner-controls"></div>
                        <div id="group-actions"></div>
                    </div>
                    <div class="channel-chat-panel">
                        <div id="group-chat">
                            <h3><i class="fas fa-comments"></i> <span id="chat-title">${groupName}</span></h3>
                            <div id="chat-box"><div class="loading-message"><i class="fas fa-spinner fa-spin"></i> Loading messages...</div></div>
                            <div class="chat-input-container">
                                <input type="text" id="chat-message" placeholder="Type a message...">
                                <button class="send-btn" onclick="sendMessage()"><i class="fas fa-paper-plane"></i></button>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        
            document.title = `${groupName} - Private Channels`;
        }
        
        function addMessageInputEvents(groupId) {
            const chatMessageInput = document.getElementById("chat-message");
            if (chatMessageInput) {
                chatMessageInput.addEventListener("keypress", (e) => {
                    if (e.key === "Enter") sendMessage();
                });
                setTimeout(() => chatMessageInput.focus(), 100);
            }
        }
        
        function fetchAndRenderGroupOwner(groupId, groupDescription) {
            fetch(`/group-owner/${groupId}`)
                .then(response => response.json())
                .then(ownerData => {
                    if (ownerData.error) {
                        console.error("Error fetching group owner:", ownerData.error);
                        return;
                    }
        
                    const ownerId = ownerData.owner_id;
                    const isOwner = loggedInUserId === ownerId;
                    fetchAndRenderGroupMembers(groupId, ownerId, isOwner, groupDescription);
                });
        }
        
        function fetchAndRenderGroupMembers(groupId, ownerId, isOwner, groupDescription) {
            fetch(`/group-members/${groupId}`)
                .then(response => response.json())
                .then(members => {
                    const memberList = document.getElementById("member-list");
                    memberList.innerHTML = "";
        
                    members.forEach(member => {
                        const listItem = document.createElement("li");
                        listItem.dataset.userId = member.id;
                        const isGroupOwner = member.id === ownerId;
        
                        listItem.innerHTML = isGroupOwner ? `<strong>${member.name} (Owner)</strong>` : member.name;
        
                        if (isOwner && member.id !== loggedInUserId && !isGroupOwner) {
                            const removeBtn = document.createElement('button');
                            removeBtn.className = 'remove-member-btn';
                            removeBtn.innerHTML = '<i class="fas fa-times"></i>';
                            removeBtn.title = 'Remove from channel';
                            removeBtn.onclick = (e) => {
                                e.stopPropagation();
                                removeMember(groupId, member.id, member.name);
                            };
                            listItem.appendChild(removeBtn);
                        }
        
                        memberList.appendChild(listItem);
                    });
        
                    updateMembersWithStatus();
                    const isMember = members.some(m => m.id === loggedInUserId);
                    renderGroupActions(groupId, isOwner, isMember);
                    handleMessageAccess(groupId, isOwner, isMember);
                });
        }
        
        function renderGroupActions(groupId, isOwner, isMember) {
            const ownerControls = document.getElementById("owner-controls");
            const groupActions = document.getElementById("group-actions");
        
            if (isOwner) {
                ownerControls.innerHTML = `
                    <h4>Pending Requests</h4>
                    <ul id="request-list">Loading requests...</ul>
                    <h4>Add Member</h4>
                    <div class="add-member-container">
                        <input type="text" id="add-user-input" placeholder="Enter username">
                        <button class="join-btn" onclick="addUserToGroup(${groupId})">
                            <i class="fas fa-user-plus"></i> Add User
                        </button>
                    </div>
                `;
                fetchPendingRequests(groupId);
            } else {
                ownerControls.innerHTML = "";
            }
        
            groupActions.innerHTML = "";
        
            if (isMember && !isOwner) {
                const leaveBtn = document.createElement("button");
                leaveBtn.className = "leave-btn";
                leaveBtn.innerHTML = `<i class="fas fa-sign-out-alt"></i> Leave Channel`;
                leaveBtn.onclick = () => leaveGroup(groupId);
                groupActions.appendChild(leaveBtn);
            } else if (!isMember) {
                const joinBtn = document.createElement("button");
                joinBtn.className = "join-btn";
                joinBtn.innerHTML = `<i class="fas fa-sign-in-alt"></i> Request to Join`;
                joinBtn.onclick = () => requestJoinGroup(groupId);
                groupActions.appendChild(joinBtn);
            }
        }
        
        function handleMessageAccess(groupId, isOwner, isMember) {
            const chatInput = document.getElementById("chat-message");
            const sendBtn = document.querySelector(".send-btn");
        
            if (isOwner || isMember) {
                chatInput.disabled = false;
                sendBtn.disabled = false;
                chatInput.placeholder = "Type a message...";
                showGroupChat(groupId);
            } else {
                chatInput.disabled = true;
                sendBtn.disabled = true;
                chatInput.placeholder = "Join this channel to send messages";
                document.getElementById("chat-box").innerHTML = `
                    <div class="access-restricted">
                        <i class="fas fa-lock"></i>
                        <p>You need to join this channel to see messages</p>
                    </div>
                `;
            }
        }
        

        function fetchPendingRequests(groupId) {
            fetch(`/group-requests/${groupId}`)
                .then(response => response.json())
                .then(requests => {
                    const requestList = document.getElementById("request-list");
                    
                    if (requests.error) {
                        requestList.innerHTML = `<li class="error"><em>${requests.error}</em></li>`;
                        return;
                    }

                    if (requests.length === 0) {
                        requestList.innerHTML = "<li><em>No pending requests</em></li>";
                        return;
                    }

                    requestList.innerHTML = requests.map(r => `
                        <li>
                            ${r.name}
                            <button class="join-btn" onclick="approveUser(${groupId}, ${r.id})">
                                <i class="fas fa-check"></i> Approve
                            </button>
                        </li>
                    `).join("");
                })
                .catch(err => {
                    console.error("Error fetching requests:", err);
                    document.getElementById("request-list").innerHTML = "<li class='error'><em>Error loading requests</em></li>";
                });
        }

        function requestJoinGroup(groupId) {
            fetch("/request-join", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ groupId })
            })
            .then(response => response.json())
            .then(data => {
                if (data.error) {
                    alert(data.error);
                } else {
                    alert(data.message);
                    // Refresh the group view
                    loadGroup(groupId, document.getElementById("chat-title").textContent, 
                        document.querySelector("#group-details p").textContent);
                }
            })
            .catch(error => console.error("Error requesting to join:", error));
        }

        function leaveGroup(groupId) {
            if (!confirm("Are you sure you want to leave this private channel?")) return;
            
            fetch("/leave-group", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ groupId })
            })
            .then(response => response.json())
            .then(data => {
                alert(data.message);
                // Refresh the page to update UI
                window.location.reload();
            })
            .catch(error => console.error("Error leaving group:", error));
        }

        function addUserToGroup(groupId) {
            const username = document.getElementById("add-user-input").value.trim();
            if (!username) return alert("Please enter a valid username");

            fetch("/add-user", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ groupId, username })
            })
            .then(response => response.json())
            .then(data => {
                if (data.error) {
                    alert(data.error);
                    return;
                }
                
                alert(data.message);
                document.getElementById("add-user-input").value = "";
                
                // Reload the group to update the members list
                loadGroup(groupId, document.getElementById("chat-title").textContent, 
                    document.querySelector("#group-details p").textContent);
            })
            .catch(error => console.error("Error adding user:", error));
        }

        function approveUser(groupId, userId) {
            fetch("/approve-user", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ groupId, userId })
            })
            .then(response => response.json())
            .then(data => {
                if (data.error) {
                    alert(data.error);
                    return;
                }
                
                alert(data.message);
                
                // Reload the group to update members and pending requests
                loadGroup(groupId, document.getElementById("chat-title").textContent, 
                    document.querySelector("#group-details p").textContent);
            })
            .catch(error => console.error("Error approving user:", error));
        }

        function showGroupChat(groupId) {
            const chatBox = document.getElementById("chat-box");
            chatBox.innerHTML = "<div class='loading-message'><i class='fas fa-spinner fa-spin'></i> Loading messages...</div>";

            // Fetch message history for this group
            fetch(`/api/group-messages/${groupId}`)
                .then(response => response.json())
                .then(messages => {
                    // Check if we're still on the same group (user might have switched)
                    if (currentGroupId !== groupId) {
                        console.log("Group changed during message fetch, aborting render");
                        return;
                    }
                    
                    chatBox.innerHTML = "";
                    
                    if (messages.length === 0) {
                        chatBox.innerHTML = "<div class='empty-message'><em>No messages yet. Be the first to say something!</em></div>";
                    } else {
                        messages.forEach(addMessageToChat);
                    }
                    
                    // Scroll to bottom of chat
                    chatBox.scrollTop = chatBox.scrollHeight;
                })
                .catch(err => {
                    console.error("Error fetching messages:", err);
                    if (document.getElementById("chat-box")) {
                        document.getElementById("chat-box").innerHTML = "<div class='error-message'><i class='fas fa-exclamation-triangle'></i> Error loading messages</div>";
                    }
                });
            
            // Clean up any existing listeners for this specific group before adding a new one
            socket.off(`group-message-${groupId}`);
            socket.on(`group-message-${groupId}`, message => {
                // Only add message if we're still on this group
                if (currentGroupId === groupId) {
                    addMessageToChat(message);
                }
            });
        }

        function addMessageToChat(message) {
            const chatBox = document.getElementById("chat-box");
            if (!chatBox) {
                console.error("Chat box not found when adding message");
                return;
            }
            
            // Clear the "No messages yet" message if it exists
            const emptyMessage = chatBox.querySelector('.empty-message');
            if (emptyMessage) {
                emptyMessage.remove();
            }
            
            const isOwnMessage = message.sender === loggedInUserName;
            const isSystemMessage = message.is_system_message;
            
            const messageEl = document.createElement("div");
            
            if (isSystemMessage) {
                messageEl.className = "system-message";
                messageEl.innerHTML = `<div class="message-text">${message.text}</div>`;
            } else {
                messageEl.className = `message ${isOwnMessage ? 'my-message' : 'other-message'}`;
                messageEl.innerHTML = `
                    <div class="message-username">${message.sender}</div>
                    <div class="message-text">${message.text}</div>
                `;
            }
            
            chatBox.appendChild(messageEl);
            chatBox.scrollTop = chatBox.scrollHeight;
        }

        function sendMessage() {
            const messageInput = document.getElementById("chat-message");
            const text = messageInput.value.trim();
            
            if (!text) return;
            
            // Ensure we're still on the current group before sending
            if (!currentGroupId) return;
            
            socket.emit("send-message", {
                groupId: currentGroupId,
                userId: loggedInUserId,
                message: text
            });
            
            messageInput.value = "";
            messageInput.focus();
        }

        // Function to edit group description
        function editDescription(groupId, currentDescription) {
            const newDescription = prompt("Edit channel description:", currentDescription || "");
            if (newDescription === null || newDescription === currentDescription) return;
            
            fetch("/update-group-description", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ groupId, description: newDescription })
            })
            .then(response => response.json())
            .then(data => {
                if (data.error) {
                    alert(data.error);
                    return;
                }
                
                alert(data.message);
                
                // Update the displayed description
                document.querySelector('.group-description').textContent = newDescription;
            })
            .catch(error => console.error("Error updating description:", error));
        }

        // Function to remove a member from the group
        function removeMember(groupId, memberId, memberName) {
            if (!confirm(`Are you sure you want to remove ${memberName} from this channel?`)) return;
            
            fetch("/remove-group-member", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ groupId, memberId })
            })
            .then(response => response.json())
            .then(data => {
                if (data.error) {
                    alert(data.error);
                    return;
                }
                
                alert(data.message);
                
                // Reload the group details to update the members list
                loadGroup(groupId, document.getElementById("chat-title").textContent, 
                    document.querySelector(".group-description").textContent);
            })
            .catch(error => console.error("Error removing member:", error));
        }

// AI Chatbot Integration
const chatFrame = document.getElementById("ai-chat-frame");
const chatLauncher = document.getElementById("ai-chat-launcher");

chatLauncher.addEventListener("click", () => {
    const isVisible = chatFrame.style.display === "block";
    chatFrame.style.display = isVisible ? "none" : "block";
    chatFrame.classList.add('fade-in');
    // If opening the chat, send a message to the iframe
    if (!isVisible) {
        chatFrame.contentWindow.postMessage({ action: 'openChat' }, '*');
    }
});

// Listen for messages from the chatbot iframe
window.addEventListener('message', (event) => {
    if (event.data.action === 'closeChat') {
        chatFrame.style.display = "none";
    }
});