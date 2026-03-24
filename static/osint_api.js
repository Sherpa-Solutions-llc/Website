document.addEventListener('DOMContentLoaded', () => {

    // --- Dynamic Host Path Injection ---
    // If we're on localhost, hit localhost:8001 (or active port).
    // If we're on live, hit railway backend.
    const isProduction = window.location.hostname.includes('sherpa-solutions') || window.location.hostname.includes('github.io');
    const apiBaseUrl = isProduction 
        ? 'https://sherpa-solutions-api-production.up.railway.app' 
        : '';
        


    const terminalOutput = document.getElementById('terminal-output');
    const termInput = document.getElementById('terminal-input');
    
    // Sandbox Elements
    const apiKeyInput = document.getElementById('sandbox-api-key');
    const endpointSelect = document.getElementById('sandbox-endpoint');
    const btnRunQuery = document.getElementById('btn-run-query');
    const btnGenerateKey = document.getElementById('btn-generate-key');
    const btnRevealKey = document.getElementById('btn-reveal-key');

    // Checkout Modal
    const modal = document.getElementById('checkout-modal');
    const btnCloseModal = document.getElementById('close-modal');
    const checkoutTitle = document.getElementById('checkout-title');
    const checkoutTierName = document.getElementById('checkout-tier-name');
    const btnCompleteCheckout = document.getElementById('btn-complete-checkout');
    const checkoutEmail = document.getElementById('checkout-email');
    
    let currentTierContext = '';

    // Terminal helper
    function pushTermLine(text, type = 'cmd-line') {
        const div = document.createElement('div');
        div.className = `term-line ${type}`;
        div.textContent = text;
        terminalOutput.appendChild(div);
        terminalOutput.scrollTop = terminalOutput.scrollHeight;
    }

    function pushTermJSON(obj) {
        const div = document.createElement('div');
        div.className = 'term-line term-json';
        div.textContent = JSON.stringify(obj, null, 2);
        terminalOutput.appendChild(div);
        terminalOutput.scrollTop = terminalOutput.scrollHeight;
    }

    // Input parsing logic
    termInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            const cmd = termInput.value.trim();
            if (!cmd) return;
            pushTermLine(`user@osint:~$ ${cmd}`, 'cmd-line');
            termInput.value = '';

            if (cmd === 'clear') {
                terminalOutput.innerHTML = '';
            } else if (cmd === 'help') {
                pushTermLine('Available commands:', 'cmd-line');
                pushTermLine('  clear - clear the terminal output');
                pushTermLine('  To run queries, use the GUI Sandbox below or use curl.', 'cmd-line');
            } else if (cmd.startsWith('curl')) {
                pushTermLine('cURL execution triggered...', 'term-success');
                // Extremely basic parsing for sandbox demo purposes
                btnRunQuery.click();
            } else {
                pushTermLine(`Command not found: ${cmd}`, 'term-error');
            }
        }
    });

    // Toggle API Key visibility
    btnRevealKey.addEventListener('click', () => {
        const icon = btnRevealKey.querySelector('i');
        if (apiKeyInput.type === 'password') {
            apiKeyInput.type = 'text';
            icon.classList.replace('fa-eye', 'fa-eye-slash');
        } else {
            apiKeyInput.type = 'password';
            icon.classList.replace('fa-eye-slash', 'fa-eye');
        }
    });

    // Validate if run is allowed
    function checkRunReady() {
        if (apiKeyInput.value.trim().length > 10) {
            btnRunQuery.disabled = false;
        } else {
            btnRunQuery.disabled = true;
        }
    }

    apiKeyInput.addEventListener('input', checkRunReady);
    
    // Update terminal placeholder based on select
    function syncCurlPlaceholder() {
        const type = endpointSelect.value;
        termInput.placeholder = `curl -X GET ${apiBaseUrl || 'https://localhost:8001'}/api/v1/osint/query?type=${type} -H "x-api-key: ${apiKeyInput.value || '<YOUR_KEY>'}"`;
    }
    
    endpointSelect.addEventListener('change', syncCurlPlaceholder);
    apiKeyInput.addEventListener('input', syncCurlPlaceholder);
    syncCurlPlaceholder();

    // Modal Handling for 'Generate Free Key' and Pricing Plan Buttons
    btnGenerateKey.addEventListener('click', () => {
        openCheckout('hobbyist');
    });

    document.querySelectorAll('.plan-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const tier = e.target.getAttribute('data-tier');
            openCheckout(tier);
        });
    });

    function openCheckout(tier) {
        currentTierContext = tier;
        checkoutTierName.textContent = tier.toUpperCase();
        
        if (tier === 'hobbyist') {
            checkoutTitle.textContent = "Free Registration";
            btnCompleteCheckout.textContent = "Generate Free Key";
            document.querySelector('.credit-card-mock').style.display = 'none';
        } else {
            checkoutTitle.textContent = "Secure Checkout";
            btnCompleteCheckout.textContent = "Pay & Generate API Key";
            document.querySelector('.credit-card-mock').style.display = 'block';
        }
        
        modal.classList.remove('hidden');
        checkoutEmail.focus();
    }

    btnCloseModal.addEventListener('click', () => {
        modal.classList.add('hidden');
    });

    // Mock API Auth Workflow
    btnCompleteCheckout.addEventListener('click', async () => {
        const email = checkoutEmail.value.trim();
        if (!email) {
            alert('Please enter a valid email.');
            return;
        }

        btnCompleteCheckout.disabled = true;
        btnCompleteCheckout.textContent = "Processing...";

        try {
            pushTermLine(`[AUTH] Initiating handshake for ${email} (${currentTierContext})...`);

            const res = await fetch(`${apiBaseUrl}/api/v1/osint/authenticate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: email, tier: currentTierContext })
            });

            const data = await res.json();
            
            if (res.ok) {
                pushTermLine(`[AUTH] Success! Key generated.`, 'term-success');
                apiKeyInput.value = data.api_key;
                apiKeyInput.type = 'text'; // Reveal it immediately to grab attention
                btnRevealKey.querySelector('i').classList.replace('fa-eye', 'fa-eye-slash');
                
                checkRunReady();
                syncCurlPlaceholder();
                
                // Close modal
                modal.classList.add('hidden');
                
                // Focus the Run button
                btnRunQuery.focus();
            } else {
                pushTermLine(`[AUTH] Failed: ${data.detail}`, 'term-error');
                alert(`Error: ${data.detail}`);
            }

        } catch (err) {
            console.error(err);
            pushTermLine(`[AUTH] Connection Error: ${err.message}`, 'term-error');
        }

        btnCompleteCheckout.disabled = false;
    });

    // Secure Data Query Workflow
    btnRunQuery.addEventListener('click', async () => {
        const key = apiKeyInput.value.trim();
        const type = endpointSelect.value;
        const url = `${apiBaseUrl}/api/v1/osint/query?type=${type}`;

        pushTermLine(`$ curl -X GET ${url} -H "x-api-key: ${key.substring(0, 10)}..."`, 'cmd-line');
        btnRunQuery.disabled = true;
        btnRunQuery.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Fetching...';

        try {
            const t0 = performance.now();
            const res = await fetch(url, {
                method: 'GET',
                headers: { 'x-api-key': key }
            });
            const t1 = performance.now();
            const ms = Math.round(t1 - t0);

            if (res.ok) {
                const data = await res.json();
                pushTermLine(`HTTP 200 OK (${ms}ms) -> Rendered via Tier: ${data.tier.toUpperCase()}`, 'term-success');
                
                // Output JSON but truncate massive lists so the browser doesn't stall
                if (data.data && data.data.length > 5) {
                    const truncated = { ...data, data: [...data.data.slice(0, 5), `... (${data.data.length - 5} additional items hidden for sandbox UI)`] };
                    pushTermJSON(truncated);
                } else {
                    pushTermJSON(data);
                }
                
            } else {
                const text = await res.text();
                pushTermLine(`HTTP ${res.status} ERROR (${ms}ms)`, 'term-error');
                
                if (res.status === 401 && isProduction) {
                    pushTermLine(`[Security Lock] The live production endpoint is strictly secured.`, 'term-error');
                    pushTermLine(`Mock keys are rejected. Please subscribe via the API Marketplace for a valid key.`, 'term-error');
                    pushTermLine(`Server Response: ${text}`, 'term-error');
                } else {
                    pushTermLine(text, 'term-error');
                }
            }

        } catch (err) {
            pushTermLine(`NETWORK ERROR: ${err.message}`, 'term-error');
        }

        btnRunQuery.disabled = false;
        btnRunQuery.innerHTML = 'Run Query <i class="fa-solid fa-play"></i>';
    });

});
