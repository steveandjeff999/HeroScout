/**
 * Bob - AI Scouting Assistant for DLDScout
 * This module provides conversational AI capabilities to help users understand team data
 */

// Fix loadChartJsIfNeeded function to accept callback properly
function loadChartJsIfNeeded(callback) {
    if (window.Chart) {
        // Chart.js is already loaded, execute callback immediately
        callback();
        return Promise.resolve();
    } else {
        // Load Chart.js dynamically
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = 'https://cdn.jsdelivr.net/npm/chart.js';
            script.onload = () => {
                resolve();
                if (callback) callback();
            };
            script.onerror = () => reject(new Error('Failed to load Chart.js'));
            document.head.appendChild(script);
        });
    }
}

// Wait until document is ready before initializing
$(document).ready(function() {
    console.log("Document ready, initializing Bob AI Assistant...");
    // Fix: Call the correctly named init method instead of initializeAssistant
    assistant.init();
});

// Global variables for the assistant
const assistant = {
    name: "Bob",
    isProcessing: false,
    dataCache: null,
    teamRankingsCache: null,
    conversationContext: {
        lastQuery: null,
        lastTeams: [],
        followUpExpected: false,
        lastAction: null,  // Add this to track the last action performed
        lastJoke: null,
        strategyTopic: null,
        currentTeams: [],
        currentMatches: [],
        recentTopics: [], // Track the most recent conversation topics
        sessionAnalytics: {}, // Track what topics user is most interested in
        preferredMetrics: [], // Track which metrics the user finds most valuable
        learningMode: false, // Enable/disable Bob's learning capabilities
        lastGraph: {
            teamNumbers: [],
            chartType: 'bar',
            metricType: 'total_score',
            chartId: null
        }
    },
    
    dataFormatter: {
        // Format values with appropriate units based on metric type
        formatValue: function(value, metricType) {
            if (typeof value !== 'number') return value;
            
            // Format based on metric type
            if (metricType.includes('rate') || metricType.includes('percentage')) {
                return (value * 100).toFixed(1) + '%';
            } else if (metricType === 'time') {
                return value.toFixed(2) + 's';
            } else {
                return value.toFixed(1);
            }
        },
        
        // Get readable description of a metric
        getMetricDescription: function(metricKey) {
            const descriptions = {
                'points': 'Total points scored across all matches',
                'rank': 'Current ranking position',
                'auto_score': 'Average points scored during autonomous period',
                'teleop_score': 'Average points scored during teleop period',
                'total_score': 'Average total points per match',
                'broke_rate': 'Percentage of matches with robot breakdowns',
                'tipped_rate': 'Percentage of matches where robot tipped over',
                'climb_success': 'Successful endgame climbs',
                'endgame_barge_value': 'Endgame climbing capability (0-3 scale)',
                'leave_bonus': 'Consistency in leaving starting area (0-2 scale)'
            };
            
            return descriptions[metricKey] || metricKey;
        }
    },
    
    // Initialize the assistant data - this is the correct method being called from document ready
    init: async function() {
        console.log("Setting up Bob AI Assistant event handlers...");
        
        // Preload data if available
        try {
            this.dataCache = await $.get('/get_all_team_averages');
            this.teamRankingsCache = await $.get('/get_team_rankings');
            console.log("Bob AI Assistant data preloaded successfully");
        } catch (error) {
            console.error("Error preloading Bob AI Assistant data:", error);
        }
        
        // Try to load saved preferences if they exist
        this.loadUserPreferences();
        
        // Initialize the UI
        this.initializeAssistant();
        
        // Add initial message
        $('.ai-assistant-messages').html(`
            <div class="ai-message">
                Hi! I'm Bob, your scouting assistant. I'm here to help you analyze team performance data.
                <br><br>You can ask me things like:
                <ul>
                    <li>"Hey Bob, show me team 5454's performance"</li>
                    <li>"Can you compare team 1234 to 5678?"</li>
                    <li>"Create a line graph for team 3603's autonomous scoring"</li>
                    <li>"Bob, who are the top 5 scoring teams?"</li>
                    <li>"Find teams that are good at climbing"</li>
                    <li>"What team has the most consistent autonomous?"</li>
                    <li>"Let's talk about match strategy"</li>
                </ul>
                What would you like to know about today?
            </div>
        `);
    },
    
    // Load user preferences from localStorage if available
    loadUserPreferences: function() {
        try {
            const savedPrefs = localStorage.getItem('bobPreferences');
            if (savedPrefs) {
                const prefs = JSON.parse(savedPrefs);
                if (prefs.preferredMetrics) this.conversationContext.preferredMetrics = prefs.preferredMetrics;
                if (prefs.sessionAnalytics) this.conversationContext.sessionAnalytics = prefs.sessionAnalytics;
                console.log("Loaded Bob preferences:", prefs);
            }
        } catch (e) {
            console.error("Error loading preferences:", e);
        }
    },
    
    // Save user preferences to localStorage
    saveUserPreferences: function() {
        try {
            const prefs = {
                preferredMetrics: this.conversationContext.preferredMetrics,
                sessionAnalytics: this.conversationContext.sessionAnalytics
            };
            localStorage.setItem('bobPreferences', JSON.stringify(prefs));
        } catch (e) {
            console.error("Error saving preferences:", e);
        }
    },
    
    // Send a message from the user to the assistant
    sendMessage: function() {
        console.log("Send message function called");
        // Get the message from the input field
        const inputField = $('#ai-assistant-input-field');
        const message = inputField.val().trim();
        
        console.log("User message:", message);
        
        // Check if message is empty or assistant is processing
        if (!message || this.isProcessing) {
            console.log("Empty message or already processing, skipping");
            return;
        }
        
        // Set processing flag
        this.isProcessing = true;
        
        // Clear input field
        inputField.val('');
        
        // Add user message to chat
        const escapedMessage = escapeHtml(message);
        $('.ai-assistant-messages').append(`
            <div class="user-message">${escapedMessage}</div>
        `);
        
        // Show typing indicator
        $('.ai-assistant-messages').append(`
            <div id="typing-indicator" class="ai-message typing-indicator">
                <div class="dot"></div>
                <div class="dot"></div>
                <div class="dot"></div>
            </div>
        `);
        
        // Scroll to bottom
        scrollToBottom();
        
        // Store in context for follow-ups
        this.conversationContext.lastQuery = message;
        
        // Process the message (with a slight delay for UX)
        setTimeout(() => {
            this.processMessage(message);
        }, 800); // Slightly longer for more natural feel
    },
    
    // Extract team numbers from message - corrected to handle numbers properly
    extractTeamNumbers: function(message) {
        console.log("Extracting team numbers from:", message);
        
        // First check for patterns we want to exclude
        if (message.match(/(top|best)\s+\d+/i)) {
            // This is likely referring to "top N teams" rather than team numbers
            const topN = message.match(/(top|best)\s+(\d+)/i);
            if (topN) {
                console.log(`Detected "top ${topN[2]} teams" pattern - not treating ${topN[2]} as a team number`);
                
                // Create a version of the message without the "top N" part for further processing
                message = message.replace(/(top|best)\s+\d+/i, '');
            }
        }
        
        // Now extract actual team numbers
        const teamNumbers = [];
        const patterns = [
            /team\s+(\d{1,4})/gi,
            /(\d{1,4})\s+team/gi,
            /(\d{1,4})\s+vs\.?\s+(\d{1,4})/gi,
            /(\d{1,4})\s+and\s+(\d{1,4})/gi,
            /\b(\d{1,4})\b/g  // Changed to \b word boundary to only match standalone numbers
        ];
        
        for (const pattern of patterns) {
            const regex = new RegExp(pattern);
            let match;
            
            // Use exec method to extract all matches
            while ((match = regex.exec(message)) !== null) {
                // Add all capturing groups
                for (let i = 1; i < match.length; i++) {
                    if (match[i] && !isNaN(parseInt(match[i]))) {
                        teamNumbers.push(match[i]);
                    }
                }
            }
        }
        
        // Remove duplicates
        const uniqueTeams = [...new Set(teamNumbers)];
        console.log("Extracted team numbers:", uniqueTeams);
        return uniqueTeams;
    },
    
    // Track user interests based on message content
    trackUserInterest: function(message) {
        // Extract topics of interest from the message
        const topics = this.extractTopicsFromMessage(message);
        
        // Update session analytics
        topics.forEach(topic => {
            if (!this.conversationContext.sessionAnalytics[topic]) {
                this.conversationContext.sessionAnalytics[topic] = 1;
            } else {
                this.conversationContext.sessionAnalytics[topic]++;
            }
        });
        
        console.log("User interests tracked:", topics);
    },
    
    // Helper method to extract topics from a message
    extractTopicsFromMessage: function(message) {
        const topics = [];
        const lowerMessage = message.toLowerCase();
        
        // Common topics to track
        const topicMappings = {
            'performance': ['performance', 'score', 'scoring', 'points'],
            'autonomous': ['auto', 'autonomous'],
            'teleop': ['teleop', 'tele-op', 'driver', 'driving'],
            'climbing': ['climb', 'climbing', 'barge', 'endgame'],
            'reliability': ['broke', 'break', 'breakdown', 'reliability'],
            'stability': ['tip', 'tipped', 'tipping', 'balance', 'stability'],
            'comparison': ['compare', 'vs', 'versus', 'better than'],
            'visualization': ['graph', 'chart', 'plot', 'visualize', 'visual'],
            'ranking': ['rank', 'top', 'best', 'highest']
        };
        
        // Check for each topic
        Object.entries(topicMappings).forEach(([topic, keywords]) => {
            if (keywords.some(keyword => lowerMessage.includes(keyword))) {
                topics.push(topic);
            }
        });
        
        return topics;
    },
    
    // Process a message and generate a response
    processMessage: function(message) {
        // Track that we're processing
        this.isProcessing = true;
        
        try {
            // Track topics mentioned
            this.trackUserInterest(message);
            
            // Extract team numbers for context
            const teamNumbers = this.extractTeamNumbers(message);
            if (teamNumbers.length > 0) {
                this.conversationContext.lastTeams = teamNumbers;
                this.conversationContext.currentTeams = teamNumbers;
            }
            
            // Special case handling for common queries - handle them client-side for better responsiveness
            const lowerMessage = message.toLowerCase().trim();
            if (lowerMessage === 'hi' || lowerMessage === 'hello' || lowerMessage === 'hey') {
                removeTypingIndicator();
                addAssistantMessage("Hello! I'm Bob, your scouting assistant. How can I help you analyze team performance today?");
                this.isProcessing = false;
                return;
            }
            
            // Handle direct team number queries locally for better responsiveness
            const teamNumberMatch = message.match(/^team\s+(\d+)$/i);
            if (teamNumberMatch && teamNumbers.length === 1) {
                const teamNumber = teamNumbers[0];
                removeTypingIndicator();
                addAssistantMessage(`Looking up information for Team ${teamNumber}. Here's what I know about their performance...`);
                
                // Fetch team data and display it
                this.showTeamStats(teamNumber);
                this.isProcessing = false;
                return;
            }
            
            // Handle direct comparisons locally if we detect comparison intent with multiple teams
            if (teamNumbers.length >= 2 && this.isComparisonQuery(message)) {
                console.log("Local comparison detected with teams:", teamNumbers);
                createTeamComparisonTable(teamNumbers);
                this.isProcessing = false;
                return;
            }
            
            // First try to handle specific chart/graph requests
            if (processUserQuery(message)) {
                // If the query was handled by chart processing, we're done
                this.isProcessing = false;
                removeTypingIndicator();
                return;
            }
            
            // Extract relevant context for the AI
            const contextData = {
                lastQuery: this.conversationContext.lastQuery,
                teamMentions: teamNumbers,
                lastTeams: this.conversationContext.lastTeams,
                conversation_history: this.getConversationHistory(),
                lastAction: this.conversationContext.lastAction
            };
            
            // Send the query to the backend AI service
            $.ajax({
                url: '/ai_query',
                method: 'POST',
                data: {
                    query: message,
                    context: JSON.stringify(contextData)
                },
                success: (data) => {
                    // Remove typing indicator
                    removeTypingIndicator();
                    
                    if (data.status === 'error') {
                        // Show error message in a user-friendly way
                        addAssistantMessage("I'm having trouble understanding that request. Let me try a different approach.", true);
                        
                        // Try a local fallback response
                        this.handleFallbackResponse(message, teamNumbers);
                        return;
                    }
                    
                    // Update conversation context
                    this.conversationContext.lastAction = data.type || 'chat';
                    
                    // Handle different response types
                    if (data.type === 'team_analysis' && data.data && data.data.team_mentions) {
                        // If team analysis, store the teams for follow-up
                        this.conversationContext.currentTeams = data.data.team_mentions;
                        this.conversationContext.followUpExpected = true;
                    }
                    
                    // Add the response to the chat
                    addAssistantMessage(data.response);
                    
                    // For certain response types, proactively add follow-up buttons
                    this.addResponseButtons(data);
                },
                error: (xhr, status, error) => {
                    console.error("AI query error:", error);
                    removeTypingIndicator();
                    
                    // Show a friendly error message
                    addAssistantMessage("I'm having some technical difficulty with that question. Let me try a simpler approach.", true);
                    
                    // Try a local fallback response
                    this.handleFallbackResponse(message, teamNumbers);
                    
                    // Add retry button
                    $('.ai-assistant-messages').append(`
                        <button class="retry-btn" onclick="assistant.retryLastMessage()">
                            Try Again
                        </button>
                    `);
                },
                complete: () => {
                    this.isProcessing = false;
                }
            });
        }
        catch (error) {
            console.error("Error processing message:", error);
            addAssistantMessage("Sorry, I encountered an error processing your request. Could you try asking in a different way?");
            this.isProcessing = false;
            removeTypingIndicator();
        }
    },

    // Add this new method to handle fallback responses client-side when the server fails
    handleFallbackResponse: function(message, teamNumbers) {
        const lowerMessage = message.toLowerCase();
        
        // Handle greetings
        if (/^(hi|hello|hey|greetings)$/i.test(message.trim())) {
            addAssistantMessage("Hello! I'm Bob, your scouting assistant. How can I help you analyze team performance today?");
            return;
        }
        
        // Handle identity questions
        if (lowerMessage.includes("who are you") || lowerMessage.includes("what are you") || lowerMessage.includes("what's your name")) {
            addAssistantMessage("I'm Bob, the AI scouting assistant for your team! I can help analyze performance data, compare teams, and provide insights for your scouting needs.");
            return;
        }
        
        // Handle team-specific queries
        if (teamNumbers.length > 0) {
            const teams = teamNumbers.join(", ");
            addAssistantMessage(`I see you're asking about Team ${teams}. I'd be happy to provide information about their performance. What specific metrics are you interested in?`);
            return;
        }
        
        // Generic fallback for other queries
        addAssistantMessage("I'm here to help with team performance analysis, match strategies, and scouting insights. Could you tell me which team you're interested in, or what specific information you need?");
    },

    // Retry the last user message if there was an error
    retryLastMessage: function() {
        if (this.conversationContext.lastQuery) {
            // Remove the retry button
            $('.retry-btn').remove();
            
            // Show typing indicator
            $('.ai-assistant-messages').append(`
                <div id="typing-indicator" class="ai-message typing-indicator">
                    <div class="dot"></div>
                    <div class="dot"></div>
                    <div class="dot"></div>
                </div>
            `);
            
            // Scroll to bottom
            scrollToBottom();
            
            // Process the message again
            setTimeout(() => {
                this.processMessage(this.conversationContext.lastQuery);
            }, 500);
        }
    },

    // Get recent conversation history for context
    getConversationHistory: function() {
        const history = [];
        const messages = $('.ai-assistant-messages').children();
        
        // Get the last 6 messages (3 exchanges) for context
        const maxMessages = Math.min(messages.length, 6);
        for (let i = messages.length - maxMessages; i < messages.length; i++) {
            if (i >= 0) {
                const element = messages[i];
                const role = $(element).hasClass('user-message') ? 'user' : 'assistant';
                const content = $(element).text();
                
                // Skip typing indicators
                if (!$(element).hasClass('typing-indicator') && content.trim()) {
                    history.push({
                        role: role,
                        content: content
                    });
                }
            }
        }
        
        return history;
    },

    // Add interactive buttons based on AI response
    addResponseButtons: function(data) {
        const buttonsContainer = $('<div class="response-buttons"></div>');
        
        // Add appropriate buttons based on response type
        if (data.type === 'team_analysis' && this.conversationContext.currentTeams.length > 0) {
            const team = this.conversationContext.currentTeams[0];
            
            buttonsContainer.append(`
                <button class="response-btn" onclick="assistant.handleButtonClick('show_stats', ${team})">
                    Show Stats
                </button>
                <button class="response-btn" onclick="assistant.handleButtonClick('show_chart', ${team})">
                    Show Chart
                </button>
            `);
            
            if (this.conversationContext.currentTeams.length > 1) {
                const teams = this.conversationContext.currentTeams.join(',');
                buttonsContainer.append(`
                    <button class="response-btn" onclick="assistant.handleButtonClick('compare_teams', '${teams}')">
                        Compare Teams
                    </button>
                `);
            }
        }
        else if (data.type === 'comparison' && data.data && data.data.teams_to_compare) {
            // The comparison has been detected by the backend
            const teams = data.data.teams_to_compare;
            setTimeout(() => {
                createTeamComparisonTable(teams);
            }, 500);
        }
        else if (data.type === 'strategy') {
            buttonsContainer.append(`
                <button class="response-btn" onclick="assistant.handleButtonClick('alliance_selection')">
                    Alliance Selection
                </button>
                <button class="response-btn" onclick="assistant.handleButtonClick('match_strategy')">
                    Match Strategy
                </button>
            `);
        }
        
        // Add the buttons to the chat if we have any
        if (buttonsContainer.children().length > 0) {
            $('.ai-assistant-messages').append(buttonsContainer);
            scrollToBottom();
        }
    },

    // Determine if this is a comparison query (enhanced version)
    isComparisonQuery: function(query) {
        const comparisonTerms = [
            'compare', 'comparison', 'versus', 'vs', 'against', 'match up', 
            'stack up', 'better than', 'stronger than', 'weaker than', 
            'difference between', 'similarities between', 'contrast'
        ];
        const lowerQuery = query.toLowerCase();
        return comparisonTerms.some(term => lowerQuery.includes(term));
    },

    // Handle button clicks for interactive responses
    handleButtonClick: function(action, parameter) {
        // Show typing indicator
        $('.ai-assistant-messages').append(`
            <div id="typing-indicator" class="ai-message typing-indicator">
                <div class="dot"></div>
                <div class="dot"></div>
                <div class="dot"></div>
            </div>
        `);
        
        // Scroll to bottom
        scrollToBottom();
        
        // Process the action
        setTimeout(() => {
            removeTypingIndicator();
            
            switch(action) {
                case 'show_stats':
                    this.showTeamStats(parameter);
                    break;
                case 'show_chart':
                    this.showTeamChart(parameter);
                    break;
                case 'compare_teams':
                    this.compareTeams(parameter.split(','));
                    break;
                case 'alliance_selection':
                    addAssistantMessage("For alliance selection, I recommend focusing on teams with complementary capabilities. Would you like me to analyze specific teams for potential alliance partners?");
                    break;
                case 'match_strategy':
                    addAssistantMessage("When developing match strategy, consider autonomous capabilities, driver skill, and endgame performance. Which specific match would you like to analyze?");
                    break;
                default:
                    addAssistantMessage("I'm not sure how to handle that action yet. Please try asking me a question directly.");
            }
        }, 800);
    },

    // Show team stats
    showTeamStats: function(team) {
        $.ajax({
            url: '/get_team_averages',
            method: 'POST',
            data: { team_number: team },
            success: function(data) {
                if (data.error) {
                    addAssistantMessage(`Sorry, I couldn't find any data for Team ${team}: ${data.error}`);
                    return;
                }
                
                let statsMessage = `<h3>Team ${team} Stats</h3>`;
                statsMessage += `<div class="stats-table">`;
                
                // Format the stats
                const averages = data.averages;
                for (const [metric, value] of Object.entries(averages)) {
                    // Create nice display name
                    const displayName = metric
                        .replace(/\(T\/F\)|\(#\)/g, '')
                        .replace(/([A-Z])/g, ' $1')
                        .replace(/^[a-z]/, str => str.toUpperCase())
                        .trim();
                    
                    // Format the value
                    let displayValue = value;
                    if (typeof value === 'number') {
                        displayValue = value.toFixed(2);
                    } else if (typeof value === 'boolean') {
                        displayValue = value ? 'Yes' : 'No';
                    }
                    
                    statsMessage += `<div class="stat-row">
                        <span class="stat-name">${displayName}:</span>
                        <span class="stat-value">${displayValue}</span>
                    </div>`;
                }
                
                statsMessage += `</div>`;
                addAssistantMessage(statsMessage);
            },
            error: function(error) {
                addAssistantMessage(`Sorry, I encountered an error retrieving data for Team ${team}.`);
            }
        });
    },

    // Show team chart
    showTeamChart: function(team) {
        // Default to line chart of match-by-match total score
        this.createGraph([team], 'line', 'total_score', 'match');
        addAssistantMessage(`I've generated a performance chart for Team ${team}. You can ask me to create different chart types like line, bar, or radar, and specify if you want to see match-by-match data or averages.`);
    },

    // Compare teams stats
    compareTeams: function(teams) {
        createTeamComparisonTable(teams);
    },

    // Initialize the assistant UI and setup - making sure this method exists
    initializeAssistant: function() {
        console.log("Creating Bob AI Assistant container and setting up event listeners...");
        
        // Replace the placeholder with the AI Assistant container
        $('#ai-assistant-placeholder').html(`
            <div id="ai-assistant-container" class="ai-assistant-container">
                <div class="ai-assistant-header">
                    <span class="ai-assistant-title">Bob - Scouting Assistant</span>
                    <div style="display: flex; align-items: center;">
                        <button class="ai-assistant-maximize-btn" title="Maximize">
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
                                <path d="M1.5 1a.5.5 0 0 0-.5.5v4a.5.5 0 0 1-1 0v-4A1.5 1.5 0 0 1 1.5 0h4a.5.5 0 0 1 0 1h-4zM10 .5a.5.5 0 0 1 .5-.5h4A1.5 1.5 0 0 1 16 1.5v4a.5.5 0 0 1-1 0v-4a.5.5 0 0 0-.5-.5h-4a.5.5 0 0 1-.5-.5zM.5 10a.5.5 0 0 1 .5.5v4a.5.5 0 0 0 .5.5h4a.5.5 0 0 1 0 1h-4A1.5 1.5 0 0 1 0 14.5v-4a.5.5 0 0 1 .5-.5zm15 0a.5.5 0 0 1 .5.5v4a1.5 1.5 0 0 1-1.5 1.5h-4a.5.5 0 0 1 0-1h4a.5.5 0 0 0 .5-.5v-4a.5.5 0 0 1 .5-.5z"/>
                            </svg>
                        </button>
                        <button class="ai-assistant-close-btn">×</button>
                    </div>
                </div>
                <div id="ai-assistant-messages" class="ai-assistant-messages">
                    <!-- Messages will be added here -->
                </div>
                <div class="ai-assistant-controls">
                    <button id="ai-assistant-clear-btn">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
                            <path d="M11 1.5v1h3.5a.5.5 0 0 1 0 1h-.538l-.853 10.66A2 2 0 0 1 11.115 16h-6.23a2 2 0 0 1-1.994-1.84L2.038 3.5H1.5a.5.5 0 0 1 0-1H5v-1A1.5 1.5 0 0 1 6.5 0h3A1.5 1.5 0 0 1 11 1.5Zm-5 0v1h4v-1a.5.5 0 0 0-.5-.5h-3a.5.5 0 0 0-.5.5ZM4.5 5.029l.5 8.5a.5.5 0 1 0 .998-.06l-.5-8.5a.5.5 0 1 0-.998.06Zm6.53-.528a.5.5 0 0 0-.528.47l-.5 8.5a.5.5 0 0 0 .998.058l.5-8.5a.5.5 0 0 0-.47-.528ZM8 4.5a.5.5 0 0 0-.5.5v8.5a.5.5 0 0 0 1 0V5a.5.5 0 0 0-.5-.5Z"/>
                        </svg>
                        Clear Chat
                    </button>
                    <button id="ai-assistant-reset-btn">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
                            <path fill-rule="evenodd" d="M8 3a5 5 0 1 0 4.546 2.914.5.5 0 0 1 .908-.417A6 6 0 1 1 8 2v1z"/>
                            <path d="M8 4.466V.534a.25.25 0 0 1 .41-.192l2.36 1.966c.12.1.12.284 0 .384L8.41 4.658A.25.25 0 0 1 8 4.466z"/>
                        </svg>
                        Reset Bob
                    </button>
                </div>
                <div class="ai-assistant-input">
                    <input type="text" id="ai-assistant-input-field" placeholder="Ask Bob a question...">
                    <button id="ai-assistant-send-btn">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
                            <path d="M15.964.686a.5.5 0 0 0-.65-.65L.767 5.855a.5.5 0 0 0-.042.978l4.988 1.328 1.329 4.988a.5.5 0 0 0 .976.045l5.359-15.15a.5.5 0 0 0-.042-.009zM3.698 15.25l1.6-5.998L10.85 4.6 3.698 15.25z"/>
                        </svg>
                    </button>
                </div>
            </div>
            <button class="ai-assistant-trigger" title="Ask Bob">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="currentColor" class="bi bi-robot" viewBox="0 0 16 16">
                    <path d="M6 12.5a.5.5 0 0 1 .5-.5h3a.5.5 0 0 1 0 1h-3a.5.5 0 0 1-.5-.5ZM3 8.062C3 6.76 4.235 5.765 5.53 5.886a26.58 26.58 0 0 0 4.94 0C11.765 5.765 13 6.76 13 8.062v1.157a.933.933 0 0 1-.765.935c-.845.147-2.34.346-4.235.346-1.895 0-3.39-.2-4.235-.346A.933.933 0 0 1 3 9.219V8.062Zm4.542-.827a.25.25 0 0 0-.217.068l-.92.9a24.767 24.767 0 0 1-1.871-.183.25.25 0 0 0-.068.495c.55.076 1.232.149 2.02.193a.25.25 0 0 0 .189-.071l.754-.736.847 1.71a.25.25 0 0 0 .404.062l.932-.97a25.286 25.286 0 0 0 1.922-.188.25.25 0 0 0-.068-.495c-.538.074-1.207.145-1.98.189a.25.25 0 0 0-.166.076l-.754.785-.842-1.7a.25.25 0 0 0-.182-.135Z"/>
                    <path d="M8.5 1.866a1 1 0 1 0-1 0V3h-2A4.5 4.5 0 0 0 1 7.5V8a1 1 0 0 0-1 1v2a1 1 0 0 0 1 1v1a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-1a1 1 0 0 0 1-1V9a1 1 0 0 0-1-1v-.5A4.5 4.5 0 0 0 10.5 3h-2V1.866ZM14 7.5V13a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V7.5A3.5 3.5 0 0 1 5.5 4h5A3.5 3.5 0 0 1 14 7.5Z"/>
                </svg>
            </button>
        `);
        
        // Set up event handlers with explicit binding
        this.setupEventListeners();
        
        // Make sure the trigger button is visible
        $('.ai-assistant-trigger').show();
        
        // Load saved size from local storage if available
        this.loadSavedSize();
        
        // Set up window resize listener to update constraints
        $(window).on('resize', this.updateMaxDimensions);
        
        // Initial update of max dimensions
        this.updateMaxDimensions();
    },

    // Setup event listeners for the AI Assistant
    setupEventListeners: function() {
        console.log("Setting up AI Assistant event listeners");
        
        // First remove any existing event handlers to prevent duplication
        $('#ai-assistant-trigger').off('click');
        $('.ai-assistant-close-btn').off('click');
        $('#ai-assistant-send-btn').off('click');
        $('#ai-assistant-input-field').off('keypress keydown');
        $('.ai-assistant-header').off('click');
        $('#ai-assistant-clear-btn').off('click');  // Remove existing clear button handlers
        $('#ai-assistant-reset-btn').off('click');  // Remove existing reset button handlers
        
        // Toggle assistant visibility with the trigger button
        $('.ai-assistant-trigger').on('click', () => {
            console.log("AI Assistant trigger button clicked");
            $('#ai-assistant-container').toggleClass('ai-assistant-open');
            if ($('#ai-assistant-container').hasClass('ai-assistant-open')) {
                $('#ai-assistant-input-field').focus();
                
                // Reset any stuck processing state
                if (this.isProcessing) {
                    console.log("Resetting stuck processing state");
                    this.isProcessing = false;
                    $('#typing-indicator').remove();
                }
            }
        });
        
        // Toggle assistant visibility when clicking the header
        $('.ai-assistant-header').on('click', (e) => {
            // Only toggle if we didn't click on the close button or maximize button
            if (!$(e.target).closest('.ai-assistant-close-btn, .ai-assistant-maximize-btn').length) {
                console.log("AI Assistant header clicked");
                $('#ai-assistant-container').toggleClass('ai-assistant-open');
                if ($('#ai-assistant-container').hasClass('ai-assistant-open')) {
                    $('#ai-assistant-input-field').focus();
                }
            }
        });
        
        // Close assistant when clicking the close button
        $('.ai-assistant-close-btn').on('click', () => {
            console.log("AI Assistant close button clicked");
            $('#ai-assistant-container').removeClass('ai-assistant-open');
            $('.ai-assistant-trigger').show(); // Make sure the trigger button is visible
        });
        
        // Send message button click with safeguard against stuck states
        $('#ai-assistant-send-btn').on('click', () => {
            console.log("AI Assistant send button clicked");
            if (this.isProcessing) {
                console.log("Assistant is processing, attempting to reset state");
                // Force reset processing state if stuck
                this.isProcessing = false;
                $('#typing-indicator').remove();
                // Add slight delay before trying to send
                setTimeout(() => this.sendMessage(), 100);
            } else {
                this.sendMessage();
            }
        });
        
        // Enter key press in input field with safeguard
        $('#ai-assistant-input-field').on('keydown', (e) => {
            if (e.key === 'Enter') {
                console.log("Enter key pressed in AI Assistant input");
                e.preventDefault();
                
                if (this.isProcessing) {
                    console.log("Assistant is processing, attempting to reset state");
                    // Force reset processing state if stuck
                    this.isProcessing = false;
                    $('#typing-indicator').remove();
                    // Add slight delay before trying to send
                    setTimeout(() => this.sendMessage(), 100);
                } else {
                    this.sendMessage();
                }
            }
        });
        
        // Add clear button functionality
        $('#ai-assistant-clear-btn').on('click', () => {
            console.log("Clear chat button clicked");
            // Clear all messages but keep the initial greeting
            const initialMessage = $('.ai-assistant-messages .ai-message').first().clone();
            $('#ai-assistant-messages').empty().append(initialMessage);
            
            // Reset the conversation context
            this.conversationContext.lastQuery = null;
            this.conversationContext.lastTeams = [];
            this.conversationContext.followUpExpected = false;
            this.conversationContext.lastAction = null;
            this.conversationContext.currentTeams = [];
            
            // Ensure the processing state is reset
            this.isProcessing = false;
            $('#typing-indicator').remove();
            
            // Add confirmation message
            addAssistantMessage("Chat history has been cleared. What would you like to know about?");
        });
        
        // Add reset button functionality
        $('#ai-assistant-reset-btn').on('click', () => {
            console.log("Reset Bob button clicked");
            
            // Reset processing state
            this.isProcessing = false;
            $('#typing-indicator').remove();
            
            // Reset all conversation context
            this.conversationContext = {
                lastQuery: null,
                lastTeams: [],
                followUpExpected: false,
                lastAction: null,
                lastJoke: null,
                strategyTopic: null,
                currentTeams: [],
                currentMatches: [],
                recentTopics: [],
                sessionAnalytics: this.conversationContext.sessionAnalytics || {},
                preferredMetrics: this.conversationContext.preferredMetrics || [],
                learningMode: false,
                lastGraph: {
                    teamNumbers: [],
                    chartType: 'bar',
                    metricType: 'total_score',
                    chartId: null
                }
            };
            
            // Clear all messages
            const initialMessage = $('.ai-assistant-messages .ai-message').first().clone();
            $('#ai-assistant-messages').empty().append(initialMessage);
            
            // Add reset confirmation message
            addAssistantMessage("I've been reset to my initial state. Let me know how I can assist you!");
        });
        
        // Add maximize button functionality
        $('.ai-assistant-maximize-btn').on('click', (e) => {
            e.stopPropagation(); // Prevent the header click event from firing
            const $container = $('#ai-assistant-container');
            
            if ($container.hasClass('maximized')) {
                // If already maximized, restore to previous size
                $container.removeClass('maximized');
                
                // Restore previous size if available
                const prevWidth = $container.data('prev-width');
                const prevHeight = $container.data('prev-height');
                
                if (prevWidth && prevHeight) {
                    $container.css({
                        width: prevWidth,
                        height: prevHeight
                    });
                }
            } else {
                // Store current size before maximizing
                $container.data('prev-width', $container.width());
                $container.data('prev-height', $container.height());
                
                // Add maximized class
                $container.addClass('maximized');
            }
            
            // Scroll to bottom after resize
            setTimeout(scrollToBottom, 300);
        });
        
        // Save size when container is resized
        const $container = $('#ai-assistant-container');
        let resizeTimeout;
        
        $container.on('mouseup', () => {
            clearTimeout(resizeTimeout);
            resizeTimeout = setTimeout(() => {
                // Don't save if maximized
                if (!$container.hasClass('maximized')) {
                    this.saveCurrentSize();
                }
            }, 300);
        });
    },
    
    // Update max dimensions based on viewport size
    updateMaxDimensions: function() {
        const $container = $('#ai-assistant-container');
        const maxWidth = window.innerWidth - 40;
        const maxHeight = window.innerHeight - 40;
        
        $container.css({
            'max-width': maxWidth + 'px',
            'max-height': maxHeight + 'px'
        });
    },
    
    // Save current size to local storage
    saveCurrentSize: function() {
        const $container = $('#ai-assistant-container');
        if (!$container.hasClass('maximized')) {
            const width = $container.width();
            const height = $container.height();
            
            try {
                localStorage.setItem('bobAssistantWidth', width);
                localStorage.setItem('bobAssistantHeight', height);
                console.log(`Saved Bob's size: ${width}x${height}`);
            } catch (e) {
                console.warn("Could not save Bob's size to local storage", e);
            }
        }
    },
    
    // Load saved size from local storage
    loadSavedSize: function() {
        try {
            const savedWidth = localStorage.getItem('bobAssistantWidth');
            const savedHeight = localStorage.getItem('bobAssistantHeight');
            
            if (savedWidth && savedHeight) {
                $('#ai-assistant-container').css({
                    width: savedWidth + 'px',
                    height: savedHeight + 'px'
                });
                console.log(`Loaded Bob's saved size: ${savedWidth}x${savedHeight}`);
            }
        } catch (e) {
            console.warn("Could not load Bob's size from local storage", e);
        }
    },

    // Determine what type of chart to create based on the query
    determineChartType: function(query) {
        const lowerQuery = query.toLowerCase();
        
        // Check for explicit chart type mentions
        if (lowerQuery.includes('line graph') || lowerQuery.includes('line chart') || 
            lowerQuery.includes('trend') || lowerQuery.includes('over time')) {
            return 'line';
        } else if (lowerQuery.includes('radar') || lowerQuery.includes('spider')) {
            return 'radar';
        } else if (lowerQuery.includes('pie chart') || lowerQuery.includes('distribution')) {
            return 'pie';
        } else {
            // Default to bar chart if no specific type is mentioned
            return 'bar';
        }
    },

    // Add new method to determine if user wants averages or match-by-match data
    determineDataGrouping: function(query) {
        const lowerQuery = query.toLowerCase();
        
        // Check for terms indicating match-by-match data
        if (lowerQuery.includes('match by match') || 
            lowerQuery.includes('match-by-match') ||
            lowerQuery.includes('per match') ||
            lowerQuery.includes('each match') ||
            lowerQuery.includes('individual matches')) {
            return 'match';
        }
        
        // Check for terms indicating averages
        if (lowerQuery.includes('average') || 
            lowerQuery.includes('overall') ||
            lowerQuery.includes('summary') ||
            lowerQuery.includes('summarize') ||
            lowerQuery.includes('averaged') ||
            lowerQuery.includes('combined')) {
            return 'average';
        }
        
        // Default to match-by-match if no preference is specified
        return 'match';
    },

    // Update the createGraph function to better handle different chart types and data grouping
    createGraph: function(teamNumbers, chartType, metricType, dataGrouping) {
        console.log(`Creating ${chartType} for teams: ${teamNumbers.join(', ')}, metric: ${metricType}, grouping: ${dataGrouping}`);
        addAssistantMessage(`Generating a ${chartType} chart for ${teamNumbers.length} teams (${dataGrouping === 'average' ? 'showing averages' : 'match-by-match'})...`);
        
        // Generate a unique ID for this chart
        const chartId = 'chart-' + Date.now();
        
        // Add a message with a chart container
        $('.ai-assistant-messages').append(`
            <div class="ai-message with-data">
                <h3>${metricType.toUpperCase().replace('_', ' ')} ${dataGrouping === 'average' ? 'AVERAGE' : 'MATCH-BY-MATCH'} PERFORMANCE</h3>
                <div class="chart-container" style="height: 300px; position: relative;">
                    <canvas id="${chartId}"></canvas>
                </div>
            </div>
        `);
        
        // Scroll to bottom
        scrollToBottom();
        
        // Fetch match data for each team and create datasets
        const datasets = [];
        let teamsProcessed = 0;
        
        // Generate colors for each team
        const colors = ['#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', '#9966FF', '#FF9F40'];
        
        // Process each team's data
        teamNumbers.forEach((teamNumber, index) => {
            const color = colors[index % colors.length];
            
            $.get('/get_match_data', { team_number: teamNumber })
                .then((matchData) => {
                    if (matchData && matchData.length > 0) {
                        // Extract the appropriate metric from match data
                        const values = matchData.map(match => {
                            // Define the scoring rules from game config
                            const scoringRules = GAME_CONFIG.scoring_rules;
                            
                            if (metricType === 'auto_score') {
                                // Calculate AUTO score
                                let autoScore = 0;
                                
                                // Leave bonus
                                if (match['Leave Bonus (T/F)'] === true || match['Leave Bonus (T/F)'] === 'true' || match['Leave Bonus (T/F)'] === 1) {
                                    autoScore += scoringRules['Leave Bonus (T/F)'];
                                }
                                
                                // Auto game pieces
                                const autoColumns = [
                                    'Auto Coral L1 (#)', 'Auto Coral L2/L3 (#)', 'Auto Coral L4 (#)',
                                    'Auto Coral Unclear (#)', 'Auto Algae Net (#)', 'Auto Algae Processor (#)'
                                ];
                                
                                autoColumns.forEach(col => {
                                    if (match[col] && scoringRules[col]) {
                                        autoScore += match[col] * scoringRules[col];
                                    }
                                });
                                
                                return autoScore;
                            } 
                            else if (metricType === 'teleop_score') {
                                // Calculate TELEOP score (excluding endgame)
                                let teleopScore = 0;
                                
                                // Teleop game pieces
                                const teleopColumns = [
                                    'Coral L1 (#)', 'Coral L2/L3 (#)', 'Coral L4 (#)',
                                    'Coral Unclear (#)', 'Algae Net (#)', 'Algae Processor (#)'
                                ];
                                
                                teleopColumns.forEach(col => {
                                    if (match[col] && scoringRules[col]) {
                                        teleopScore += match[col] * scoringRules[col];
                                    }
                                });
                                
                                return teleopScore;
                            }
                            else if (metricType === 'endgame_score') {
                                // Calculate ENDGAME score
                                let endgameScore = 0;
                                
                                // Endgame barge
                                if (match['Endgame Barge'] !== undefined && scoringRules['Endgame Barge']) {
                                    const bargeValue = Math.round(parseFloat(match['Endgame Barge']));
                                    const bargeKey = bargeValue.toString();
                                    if (scoringRules['Endgame Barge'][bargeKey]) {
                                        endgameScore += scoringRules['Endgame Barge'][bargeKey];
                                    }
                                }
                                
                                return endgameScore;
                            }
                            else {
                                // Default to total score
                                return (match.Score !== undefined) ? parseFloat(match.Score) : 0;
                            }
                        });
                        
                        // Process data based on grouping preference
                        if (dataGrouping === 'average') {
                            // Calculate average
                            const average = values.reduce((sum, val) => sum + val, 0) / values.length;
                            
                            // For averages, we just need one value per team
                            datasets.push({
                                label: `Team ${teamNumber}`,
                                data: [average],
                                backgroundColor: chartType === 'bar' ? color + '80' : 'transparent',
                                borderColor: color,
                                pointBackgroundColor: color,
                                pointBorderColor: '#fff',
                                tension: 0.1
                            });
                        } else {
                            // For match-by-match, use all values
                            datasets.push({
                                label: `Team ${teamNumber}`,
                                data: values,
                                backgroundColor: chartType === 'bar' ? color + '80' : 'transparent',
                                borderColor: color,
                                pointBackgroundColor: color,
                                pointBorderColor: '#fff',
                                tension: 0.1
                            });
                        }
                    }
                })
                .fail((error) => {
                    console.error(`Failed to get match data for team ${teamNumber}:`, error);
                })
                .always(() => {
                    teamsProcessed++;
                    
                    // Once all teams processed, create the chart
                    if (teamsProcessed === teamNumbers.length) {
                        createChartNow();
                    }
                });
        });
        
        // Function to create chart after data is ready
        function createChartNow() {
            // Remove typing indicator before creating the chart
            removeTypingIndicator();
            
            if (datasets.length > 0) {
                const ctx = document.getElementById(chartId).getContext('2d');
                
                // Generate labels based on data grouping preference
                let labels;
                if (dataGrouping === 'average') {
                    // For averages, use team numbers as labels if there are multiple teams,
                    // or "Average" if there's just one team
                    if (teamNumbers.length > 1) {
                        labels = teamNumbers.map(team => `Team ${team}`);
                    } else {
                        labels = ['Average'];
                    }
                } else {
                    // For match-by-match, generate match numbers
                    const maxMatches = Math.max(...datasets.map(ds => ds.data.length));
                    labels = Array.from({ length: maxMatches }, (_, i) => `Match ${i+1}`);
                }
                
                // Create chart configuration with appropriate labels
                new Chart(ctx, {
                    type: chartType,
                    data: {
                        labels: labels,
                        datasets: datasets
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        scales: {
                            y: {
                                beginAtZero: true,
                                ticks: {
                                    color: 'white',
                                    font: { size: 14 }
                                },
                                grid: {
                                    color: 'rgba(255, 255, 255, 0.1)'
                                }
                            },
                            x: {
                                ticks: {
                                    color: 'white',
                                    font: { size: 14 }
                                },
                                grid: {
                                    color: 'rgba(255, 255, 255, 0.1)'
                                }
                            }
                        },
                        plugins: {
                            legend: {
                                labels: {
                                    color: 'white',
                                    font: { size: 14 }
                                },
                                display: !(dataGrouping === 'average' && teamNumbers.length === 1)
                            },
                            title: {
                                display: true,
                                text: `${metricType.replace('_', ' ').toUpperCase()} ${dataGrouping === 'average' ? 'AVERAGE' : 'MATCH-BY-MATCH'} PERFORMANCE`,
                                color: 'white',
                                font: { size: 18 }
                            }
                        }
                    }
                });
            } else {
                $(`#${chartId}`).parent().html(`<p>No data available for the selected teams</p>`);
            }
        }
    },

    // Add method to create graph for all teams (stub - will need to implement)
    createGraphForAllTeams: function(chartType, metricType, dataGrouping) {
        // For now, just notify user we need specific teams
        removeTypingIndicator();
        addAssistantMessage("To create a chart, I need to know which specific teams you're interested in. Could you please provide team numbers?");
    }
};

// Add assistant message to chat
function addAssistantMessage(message) {
    $('.ai-assistant-messages').append(`<div class="ai-message">${message}</div>`);
    scrollToBottom();
}

// Check if string contains any terms from an array
function containsAny(str, terms) {
    return terms.some(term => str.includes(term));
}

// Scroll chat to bottom
function scrollToBottom() {
    const container = document.getElementById('ai-assistant-messages');
    if (container) {
        container.scrollTop = container.scrollHeight;
    }
}

// Escape HTML to prevent XSS
function escapeHtml(unsafe) {
    return unsafe
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

// Add this function to ensure the typing indicator is always removed
function removeTypingIndicator() {
    $('#typing-indicator').remove();
}

// Update the createTeamComparisonTable function to remove the typing indicator
function createTeamComparisonTable(teams) {
    $.ajax({
        url: '/compare_teams',
        method: 'POST',
        data: { 'teams[]': teams },
        success: function(data) {
            // Remove the typing indicator
            removeTypingIndicator();
            
            // Create table HTML
            let tableHTML = '<table class="table table-sm table-striped">';
            
            // Add table headers
            tableHTML += '<thead class="table-dark"><tr><th>Metric</th>';
            teams.forEach(team => {
                tableHTML += `<th>Team ${team}</th>`;
            });
            tableHTML += '</tr></thead><tbody>';
            
            // List of metrics to display in specific order
            const metrics = [
                'total_score', 'auto_score', 'teleop_score', 
                'Leave Bonus (T/F)', 'Auto Coral L1 (#)', 'Auto Coral L2/L3 (#)', 
                'Auto Coral L4 (#)', 'Auto Algae Net (#)', 'Auto Algae Processor (#)',
                'Coral L1 (#)', 'Coral L2/L3 (#)', 'Coral L4 (#)',
                'Algae Net (#)', 'Algae Processor (#)', 'Endgame Barge',
                'Minor Fouls', 'Major Fouls'
            ];
            
            // For each metric, determine min/max values across teams
            metrics.forEach(metric => {
                // Create nice display name for the metric
                const displayName = metric.replace(/\(T\/F\)|\(#\)/g, '')
                                      .replace(/([A-Z])/g, ' $1')
                                      .replace(/^[a-z]/, str => str.toUpperCase())
                                      .trim();
                
                tableHTML += `<tr><td><strong>${displayName}</strong></td>`;
                
                // Get all values for this metric across teams
                const values = [];
                teams.forEach(team => {
                    if (data[team] && data[team][metric] !== undefined) {
                        values.push(data[team][metric]);
                    }
                });
                
                // Find best and worst values (highest is usually best except for fouls)
                const reversedMetrics = ['Minor Fouls', 'Major Fouls'];
                const isReversed = reversedMetrics.includes(metric);
                
                let bestValue, worstValue;
                if (values.length > 0) {
                    if (isReversed) {
                        bestValue = Math.min(...values);
                        worstValue = Math.max(...values);
                    } else {
                        bestValue = Math.max(...values);
                        worstValue = Math.min(...values);
                    }
                }
                
                // Add table cells with appropriate highlighting
                teams.forEach(team => {
                    const teamData = data[team];
                    if (teamData && teamData[metric] !== undefined) {
                        // Format the value (round numbers to 2 decimal places)
                        let value = teamData[metric];
                        if (typeof value === 'number') {
                            value = value.toFixed(2);
                        }
                        
                        // Apply highlighting with contrasting text colors
                        let cellClass = '';
                        if (values.length > 1) {
                            if (teamData[metric] === bestValue && bestValue !== worstValue) {
                                cellClass = 'bg-success text-white'; // Green with white text
                            } else if (teamData[metric] === worstValue && bestValue !== worstValue) {
                                cellClass = 'bg-danger text-white'; // Red with white text
                            } else if (values.length > 2 && bestValue !== worstValue) {
                                cellClass = 'bg-warning text-dark'; // Yellow with dark text
                            }
                        }
                        
                        // Add the cell with class and value
                        tableHTML += `<td class="${cellClass}">${value}</td>`;
                    } else {
                        tableHTML += '<td>--</td>';
                    }
                });
                
                tableHTML += '</tr>';
            });
            
            tableHTML += '</tbody></table>';
            
            // Display the table in the chat
            addAssistantMessage(tableHTML);
        },
        error: function(error) {
            // Also remove the typing indicator on error
            removeTypingIndicator();
            addAssistantMessage('Error comparing teams: ' + error.responseJSON?.error || 'Unknown error');
        }
    });
}

// Update in processUserQuery function to handle more specific chart types and data grouping
function processUserQuery(query) {
    const lowerQuery = query.toLowerCase();
    const graphPattern = /graph|chart|plot|visualize|diagram|show me a graph/i;

    if (graphPattern.test(lowerQuery)) {
        const teamNumbers = assistant.extractTeamNumbers(query);
        let chartType = assistant.determineChartType(lowerQuery);
        let metricType = "total_score";
        let dataGrouping = assistant.determineDataGrouping(lowerQuery);
        
        if (lowerQuery.includes("auto") || lowerQuery.includes("autonomous")) {
            metricType = "auto_score";
        } else if (lowerQuery.includes("teleop") || lowerQuery.includes("driver") || lowerQuery.includes("tele-op")) {
            metricType = "teleop_score";
        } else if (lowerQuery.includes("endgame") || lowerQuery.includes("end game") || lowerQuery.includes("barge")) {
            metricType = "endgame_score";
        }
        
        if (teamNumbers.length > 0) {
            assistant.createGraph(teamNumbers, chartType, metricType, dataGrouping);
        } else {
            assistant.createGraphForAllTeams(chartType, metricType, dataGrouping);
        }
        return true;
    }
    return false;
}
