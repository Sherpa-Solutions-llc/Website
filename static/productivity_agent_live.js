let ws;
let selectedFile = null;

window.startLiveMode = function() {
    const wsStatusText = document.getElementById('ws-status-text');
    const statusDot = document.querySelector('.status-dot');
    const taskForm = document.getElementById('task-form');
    const taskInput = document.getElementById('task-input');
    const logContainer = document.getElementById('log-container');
    const clearLogsBtn = document.getElementById('clear-logs-btn');
    const submitBtn = document.getElementById('submit-btn');

    const fileUpload = document.getElementById('file-upload');
    const attachmentPreview = document.getElementById('attachment-preview');
    const attachmentName = document.getElementById('attachment-name');
    const removeAttachmentBtn = document.getElementById('remove-attachment-btn');

    // Environment Detection for Simulation Toggle
    const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    if (isLocalhost) {
        if (wsStatusText) {
            wsStatusText.style.display = 'none';
        }
    }

    let ws;
    let selectedFile = null;

    async function fetchHistory() {
        try {
            const response = await fetch('/history');
            const data = await response.json();
            if (data.messages && data.messages.length > 0) {
                data.messages.forEach(msg => {
                    const isUser = msg.role === 'user';
                    const sender = isUser ? 'You' : (msg.agent_name || 'Agent');
                    addChatMessage(sender, msg.content, isUser);
                });
            }
        } catch (e) {
            console.error('Failed to load history:', e);
        }
    }

    fetchHistory();

    if (fileUpload) {
        fileUpload.addEventListener('change', (e) => {
            if (e.target.files.length > 0) {
                selectedFile = e.target.files[0];
                if (attachmentName) attachmentName.textContent = selectedFile.name;
                if (attachmentPreview) attachmentPreview.classList.remove('hidden');
            }
        });
    }

    if (removeAttachmentBtn) {
        removeAttachmentBtn.addEventListener('click', () => {
            selectedFile = null;
            if (fileUpload) fileUpload.value = '';
            if (attachmentPreview) attachmentPreview.classList.add('hidden');
        });
    }

    function connectWebSocket() {
        // Dynamic WebSocket Routing
        const isProduction = window.location.hostname.includes('sherpa-solutions') || window.location.hostname.includes('github.io');
        
        // Target Railway App if in production, else local server
        const wsUrl = isProduction 
            ? 'wss://sherpa-solutions-api-production.up.railway.app/ws' 
            : `ws://localhost:8001/ws`;

        ws = new WebSocket(wsUrl);

        ws.onopen = () => {
            const statusDot = document.querySelector('.status-dot');
            if (statusDot) {
                statusDot.classList.remove('disconnected');
                statusDot.classList.add('connected');
            }
            addLog('SYSTEM', 'Link established with Backend Server.', 'system');
        };

        ws.onclose = () => {
            wsStatusText.textContent = 'Disconnected';
            statusDot.classList.remove('connected');
            statusDot.classList.add('disconnected');
            addLog('SYSTEM', 'Connection lost. Reconnecting in 3s...', 'error');
            setTimeout(connectWebSocket, 3000);
        };

        ws.onerror = (error) => {
            console.error('WebSocket Error:', error);
        };

        ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                handleServerMessage(data);
            } catch (e) {
                console.error("Error parsing message", e);
            }
        };
    }

    const chatThread = document.getElementById('chat-thread');
    const agentQuestionBox = document.getElementById('agent-question-box');
    const questionSenderName = document.getElementById('question-sender-name');
    const questionTextObj = document.getElementById('question-text');

    let currentQuestionAgent = null;

    function handleServerMessage(data) {
        if (data.type === 'log') {
            addLog(data.agent, data.message, mapAgentToClass(data.agent));
        } else if (data.type === 'status') {
            updateAgentStatus(data.agent, data.status);
        } else if (data.type === 'progress') {
            updateAgentProgress(data.agent, data.progress);
        } else if (data.type === 'question') {
            displayAgentQuestion(data.agent, data.question);
        } else if (data.type === 'chat') {
            // New conversational chat bubble
            addChatMessage(data.agent, data.message, false);
            addLog('SYSTEM', `${data.agent} sent a chat reply.`, 'system');
        } else if (data.type === 'chat_cleared') {
            chatThread.innerHTML = '';
            addLog('SYSTEM', 'Chat context cleared. Starting fresh session.', 'system');
        } else if (data.type === 'diagram') {
            addMermaidDiagram(data.diagram);
        } else if (data.type === 'suggestions') {
            addFollowUpSuggestions(data.suggestions);
        }
    }
    function addMermaidDiagram(diagramText) {
        const msgDiv = document.createElement('div');
        msgDiv.className = 'chat-message system';
        msgDiv.style.background = 'rgba(0,0,0,0.3)';
        msgDiv.style.border = '1px solid var(--glass-border)';

        const title = document.createElement('strong');
        title.style.display = 'block';
        title.style.marginBottom = '10px';
        title.innerHTML = '<i class="fa-solid fa-code-merge"></i> Agent Execution Plan';
        msgDiv.appendChild(title);

        const diagramContainer = document.createElement('div');
        diagramContainer.className = 'mermaid';
        diagramContainer.innerHTML = diagramText;
        msgDiv.appendChild(diagramContainer);

        chatThread.appendChild(msgDiv);
        chatThread.scrollTop = chatThread.scrollHeight;

        if (typeof mermaid !== 'undefined') {
            // Need to wait slightly for DOM insertion before mermaid renders
            setTimeout(() => {
                mermaid.init(undefined, diagramContainer);
            }, 50);
        }
    }

    function addFollowUpSuggestions(suggestionsList) {
        if (!suggestionsList || !suggestionsList.length) return;

        const container = document.createElement('div');
        container.className = 'suggestions-container';
        container.style.display = 'flex';
        container.style.gap = '10px';
        container.style.flexWrap = 'wrap';
        container.style.marginTop = '10px';
        container.style.marginBottom = '10px';

        suggestionsList.forEach(suggestion => {
            const pill = document.createElement('button');
            pill.className = 'suggestion-pill';
            pill.style.background = 'rgba(88, 166, 255, 0.15)';
            pill.style.border = '1px solid rgba(88, 166, 255, 0.4)';
            pill.style.color = '#58a6ff';
            pill.style.padding = '6px 14px';
            pill.style.borderRadius = '20px';
            pill.style.cursor = 'pointer';
            pill.style.fontSize = '0.85rem';
            pill.style.transition = 'all 0.2s ease';

            pill.innerText = suggestion;

            pill.onmouseenter = () => {
                pill.style.background = 'rgba(88, 166, 255, 0.3)';
            };
            pill.onmouseleave = () => {
                pill.style.background = 'rgba(88, 166, 255, 0.15)';
            };

            pill.onclick = () => {
                taskInput.value = suggestion;
                setTimeout(() => {
                    const submitEvent = new Event('submit', { cancelable: true });
                    taskForm.dispatchEvent(submitEvent);
                }, 50);
                container.style.opacity = '0.5';
                container.style.pointerEvents = 'none';
            };
            container.appendChild(pill);
        });

        chatThread.appendChild(container);
        chatThread.scrollTop = chatThread.scrollHeight;
    }

    function addChatMessage(sender, text, isUser) {
        const msgDiv = document.createElement('div');
        msgDiv.className = `chat-message ${isUser ? 'user' : 'agent'}`;

        const boldSender = document.createElement('strong');
        boldSender.style.display = 'block';
        boldSender.style.marginBottom = '5px';
        boldSender.innerText = isUser ? 'You:' : `${sender}:`;
        msgDiv.appendChild(boldSender);

        const textWrapper = document.createElement('div');
        if (isUser) {
            textWrapper.innerText = text;
        } else {
            // Use marked.js for rich markdown parsing
            try {
                if (typeof marked !== 'undefined') {
                    textWrapper.innerHTML = marked.parse(text);
                    if (typeof hljs !== 'undefined') {
                        textWrapper.querySelectorAll('pre code').forEach((block) => {
                            hljs.highlightElement(block);
                            const pre = block.parentElement;
                            pre.style.position = 'relative';

                            const copyBtn = document.createElement('button');
                            copyBtn.className = 'code-copy-btn';
                            copyBtn.innerHTML = '<i class="fa-regular fa-clipboard"></i> Copy';
                            copyBtn.onclick = () => {
                                navigator.clipboard.writeText(block.innerText);
                                copyBtn.innerHTML = '<i class="fa-solid fa-check"></i> Copied!';
                                setTimeout(() => {
                                    copyBtn.innerHTML = '<i class="fa-regular fa-clipboard"></i> Copy';
                                }, 2000);
                            };
                            pre.appendChild(copyBtn);
                        });
                    }
                } else {
                    textWrapper.innerHTML = text;
                }
            } catch (e) {
                textWrapper.innerHTML = text;
            }
        }
        msgDiv.appendChild(textWrapper);

        chatThread.appendChild(msgDiv);
        chatThread.scrollTop = chatThread.scrollHeight;
    }

    function displayAgentQuestion(agent, question) {
        currentQuestionAgent = agent;
        questionSenderName.textContent = agent;
        questionTextObj.textContent = question;
        agentQuestionBox.classList.remove('hidden');

        taskInput.placeholder = `Reply to ${agent}...`;
        taskInput.focus();

        addChatMessage(agent, question, false);
    }

    taskInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            const submitEvent = new Event('submit', { cancelable: true });
            taskForm.dispatchEvent(submitEvent);
        }
    });

    taskForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const taskText = taskInput.value.trim();
        if (!taskText && !selectedFile) return;

        if (ws && ws.readyState === WebSocket.OPEN) {
            submitBtn.disabled = true;
            submitBtn.style.opacity = '0.5';

            let payload = {};

            const modelSelect = document.getElementById('model-select');
            const selectedModel = modelSelect ? modelSelect.value : 'gemini-2.5-flash';

            // Determine if this is a reply to an agent or a new task
            if (currentQuestionAgent) {
                payload = {
                    action: 'reply_to_agent',
                    target_agent: currentQuestionAgent,
                    text: taskText,
                    llm_model: selectedModel
                };
            } else {
                payload = {
                    action: 'start_task',
                    task: taskText,
                    llm_model: selectedModel
                };
            }

            const finishTaskSubmit = () => {
                try {
                    const attachMsg = selectedFile ? ` [Attached: ${selectedFile.name}]` : '';

                    if (currentQuestionAgent) {
                        addLog('SYSTEM', `Replied to ${currentQuestionAgent}: "${taskText}"${attachMsg}`, 'system');
                        addChatMessage('You', taskText + attachMsg, true);

                        // Cleanup question UI
                        agentQuestionBox.classList.add('hidden');
                        currentQuestionAgent = null;
                        taskInput.placeholder = "Message the agents... (e.g. 'Research Apple stock and build a landing page for it')";
                    } else {
                        addLog('SYSTEM', `Task dispatched: "${taskText}"${attachMsg}`, 'system');
                        addChatMessage('You', taskText + attachMsg, true);
                    }

                    taskInput.value = '';
                    removeAttachmentBtn.click(); // Clear the attachment
                } catch (err) {
                    console.error("Error during submit UI update:", err);
                } finally {
                    setTimeout(() => {
                        submitBtn.disabled = false;
                        submitBtn.style.opacity = '1';
                    }, 500);
                }
            };

            if (selectedFile) {
                const reader = new FileReader();
                reader.onload = (event) => {
                    const base64Data = event.target.result.split(',')[1];
                    payload.file_data = base64Data;
                    payload.file_name = selectedFile.name;
                    payload.mime_type = selectedFile.type;

                    ws.send(JSON.stringify(payload));
                    finishTaskSubmit();
                };
                reader.readAsDataURL(selectedFile);
            } else {
                ws.send(JSON.stringify(payload));
                finishTaskSubmit();
            }
        } else {
            alert("WebSocket is not connected. Please wait for connection or refresh.");
        }
    });

    if (clearLogsBtn) {
        clearLogsBtn.addEventListener('click', () => {
            if (logContainer) logContainer.innerHTML = '';
            addLog('SYSTEM', 'Logs cleared.', 'system');
        });
    }

    function mapAgentToClass(agent) {
        if (!agent) return 'system';
        const lower = agent.toLowerCase();
        if (lower.includes('master')) return 'master';
        if (lower.includes('research')) return 'research';
        if (lower.includes('stock')) return 'stock';
        if (lower.includes('web')) return 'web';
        if (lower.includes('data')) return 'data';
        if (lower.includes('code') || lower.includes('review')) return 'code';
        if (lower.includes('test') || lower.includes('qa')) return 'qa';
        return 'system';
    }

    function addLog(agent, message, cssClass) {
        const entry = document.createElement('div');
        entry.className = `log-entry ${cssClass}`;

        const time = new Date().toLocaleTimeString([], { hour12: false });

        const timestampSpan = document.createElement('span');
        timestampSpan.className = 'timestamp';
        timestampSpan.innerText = `[${time}]`;

        const prefix = agent !== 'SYSTEM' ? `${agent}: ` : '';
        const msgSpan = document.createElement('span');

        if (message.length > 200 || message.includes('\n')) {
            const summaryText = prefix + message.substring(0, 100).replace(/\n/g, ' ') + '...';
            const details = document.createElement('details');
            const summary = document.createElement('summary');
            summary.style.cursor = 'pointer';
            summary.innerText = summaryText;
            details.appendChild(summary);

            const fullContent = document.createElement('pre');
            fullContent.style.whiteSpace = 'pre-wrap';
            fullContent.style.marginTop = '0.5rem';
            fullContent.style.background = 'rgba(0,0,0,0.2)';
            fullContent.style.padding = '0.5rem';
            fullContent.style.borderRadius = '4px';
            fullContent.innerText = message;
            details.appendChild(fullContent);
            msgSpan.appendChild(details);
        } else {
            msgSpan.innerText = prefix + message;
        }

        entry.appendChild(timestampSpan);
        entry.appendChild(msgSpan);

        logContainer.appendChild(entry);
        logContainer.scrollTop = logContainer.scrollHeight;
    }

    function getAgentId(agent) {
        const lower = agent.toLowerCase();
        if (lower.includes('master')) return 'agent-master';
        if (lower.includes('research')) return 'agent-research';
        if (lower.includes('stock')) return 'agent-stock';
        if (lower.includes('web')) return 'agent-web';
        if (lower.includes('data')) return 'agent-data';
        if (lower.includes('code') || lower.includes('review')) return 'agent-code';
        if (lower.includes('test') || lower.includes('qa')) return 'agent-qa';
        return null;
    }

    function updateAgentStatus(agent, status) {
        const cardId = getAgentId(agent);
        if (!cardId) return;
        const card = document.getElementById(cardId);
        if (!card) return;

        const stateDiv = card.querySelector('.agent-state');
        if (stateDiv) {
            stateDiv.textContent = status;
            stateDiv.className = 'agent-state';

            if (status.toLowerCase().includes('executing') || status.toLowerCase().includes('planning') || status.toLowerCase().includes('delegating')) {
                stateDiv.classList.add('status-active-text');
                card.classList.add('active');
            } else if (status.toLowerCase().includes('completed')) {
                stateDiv.classList.add('status-success-text');
                card.classList.remove('active');
            } else {
                card.classList.remove('active');
            }
        }
    }

    function updateAgentProgress(agent, progress) {
        const cardId = getAgentId(agent);
        if (!cardId) return;
        const card = document.getElementById(cardId);
        if (!card) return;

        const fill = card.querySelector('.progress-fill');
        const text = card.querySelector('.progress-text');

        if (fill) fill.style.width = `${progress}%`;
        if (text) text.textContent = `${progress}%`;
    }

    const taskInputSection = document.querySelector('.task-input-section');

    taskInputSection.addEventListener('dragover', (e) => {
        e.preventDefault();
        taskInputSection.style.border = '2px dashed var(--primary)';
    });

    taskInputSection.addEventListener('dragleave', (e) => {
        e.preventDefault();
        taskInputSection.style.border = 'none';
    });

    taskInputSection.addEventListener('drop', (e) => {
        e.preventDefault();
        taskInputSection.style.border = 'none';
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            selectedFile = e.dataTransfer.files[0];
            attachmentName.textContent = selectedFile.name;
            attachmentPreview.classList.remove('hidden');
        }
    });

    const exportBtn = document.getElementById('export-btn');
    if (exportBtn) {
        exportBtn.addEventListener('click', () => {
            window.location.href = '/export';
        });
    }

    const themeToggle = document.getElementById('theme-toggle');
    if (themeToggle) {
        themeToggle.addEventListener('click', () => {
            document.body.classList.toggle('light-theme');
            const icon = themeToggle.querySelector('i');
            if (document.body.classList.contains('light-theme')) {
                icon.classList.remove('fa-moon');
                icon.classList.add('fa-sun');
            } else {
                icon.classList.remove('fa-sun');
                icon.classList.add('fa-moon');
            }
        });
    }

    const sherpaToggle = document.getElementById('toggle-sherpa-btn');
    if (sherpaToggle) {
        sherpaToggle.addEventListener('click', () => {
            const appContainer = document.querySelector('.app-container');
            const dashboardGrid = document.querySelector('.dashboard-grid');
            const sherpaPanel = document.getElementById('sherpa-panel');
            const icon = sherpaToggle.querySelector('i');

            appContainer.classList.toggle('show-sherpa');
            dashboardGrid.classList.toggle('show-sherpa');

            if (appContainer.classList.contains('show-sherpa')) {
                sherpaPanel.style.display = 'flex';
                icon.style.color = 'var(--accent-color)';
            } else {
                sherpaPanel.style.display = 'none';
                icon.style.color = '';
            }
        });
    }

    // New Chat and Halt Handlers
    const newChatBtn = document.getElementById('new-chat-btn');
    if (newChatBtn) {
        newChatBtn.addEventListener('click', () => {
            if (ws && ws.readyState === WebSocket.OPEN) {
                if (confirm("Are you sure you want to completely clear the chat context and set up a new session?")) {
                    ws.send(JSON.stringify({ action: 'new_chat' }));
                }
            }
        });
    }

    const haltTaskBtn = document.getElementById('halt-task-btn');
    if (haltTaskBtn) {
        haltTaskBtn.addEventListener('click', () => {
            if (ws && ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ action: 'halt_task' }));
            }
        });
    }

    // Initialize
    connectWebSocket();
};
