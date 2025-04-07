"""
Bob - AI Scouting Assistant for DLDScout
Enhanced version with improved natural language understanding and context awareness
"""

import re
import json
import random
import numpy as np
import os
from datetime import datetime
from collections import defaultdict, deque

# Import the ConfigLoader for settings
from config_loader import config_loader

# Size of Bob's memory (number of conversation turns to remember)
MEMORY_SIZE = 10

# Enhanced data patterns for better entity recognition
TEAM_NUMBER_PATTERN = r'\b(?:team\s*#?\s*)?(\d{1,4})\b'
COMPARISON_PATTERN = r'(?:compare|vs|versus|against|better than|compared to|comparison)'
MATCH_PATTERN = r'\b(?:match|game)\s*#?\s*(\d{1,3})\b'

# Dictionary of responses for different topics with multiple variations for more natural conversation
RESPONSES = {
    "greeting": [
        "Hi there! I'm Bob, your scouting assistant. What can I help you with today?",
        "Hello! Bob here, ready to help with your scouting questions.",
        "Hey! I'm Bob, your AI scouting buddy. What would you like to know?",
        "Greetings! Bob at your service. How can I assist with your scouting needs?"
    ],
    "team_info": [
        "Let me pull up the information for team {0}...",
        "Looking up team {0}'s stats for you...",
        "Accessing data for team {0}, one moment...",
        "I'll get you the details on team {0} right away..."
    ],
    "compare_intro": [
        "Let's compare teams {0}...",
        "I'll analyze the performance of teams {0} for you...",
        "Comparing teams {0} now...",
        "Let me break down the comparison between teams {0}..."
    ],
    "analysis_intro": [
        "Based on my analysis...",
        "Looking at the data...",
        "From what I can see in the scouting data...",
        "According to the statistics..."
    ],
    "unknown": [
        "I'm not sure I understand. Could you rephrase that?",
        "I didn't quite catch that. Can you ask in a different way?",
        "I'm still learning, and I'm not sure what you're asking. Could you try rewording your question?",
        "I don't have enough information to answer that question yet."
    ],
    "fallback": [
        "I'm still learning about that. Can I help you with something else related to team statistics or comparisons?",
        "That's beyond my current capabilities, but I can help you analyze team performance data if you'd like.",
        "I don't have enough information to answer that properly. Would you like to know about a specific team instead?",
        "I'm not equipped to answer that yet. How about we look at some team statistics instead?"
    ]
}

# Personality traits for Bob to make interactions more engaging
PERSONALITY_TRAITS = {
    "enthusiastic": {
        "phrases": ["Wow!", "Amazing!", "That's impressive!", "Fascinating!"],
        "frequency": 0.3
    },
    "analytical": {
        "phrases": ["Interestingly,", "Notably,", "The data suggests that", "Analysis shows"],
        "frequency": 0.4
    },
    "helpful": {
        "phrases": ["I'd recommend looking at", "You might want to consider", "It would be beneficial to focus on", "Let me help you understand"],
        "frequency": 0.5
    }
}

# Enhanced joke list for when Bob is asked to tell a joke
JOKES = [
    "Why did the robot go back to robot school? Because its skills were getting a little rusty!",
    "What do you call a robot that always takes the scenic route? A meandroid!",
    "How do robots eat pizza? One byte at a time!",
    "Why was the robot so tired? It had a hard drive!",
    "What do you call a robot that can't tell a joke? Humor-less!",
    "Why are robots never afraid? Because they have nerves of steel!",
    "What's a robot's favorite type of music? Heavy metal!",
    "What do you get when you cross a robot with a tractor? A trans-farmer!",
    "How does a robot make a decision? It uses its algo-rhythm!",
    "Why did the robot apply for the job? It was well-programmed for it!"
]

# Simple rule-based responses
def get_rule_based_response(query, conversation_history=None, team_mentions=None):
    """Generate responses using rules instead of LLM"""
    query = query.lower()
    
    # Initialize response
    response = {
        "response": "I'm sorry, I don't have an answer for that.",
        "source": "rule_based",
        "chart_type": None,
        "chart_data": None,
        "suggested_queries": []
    }
    
    # Team information request
    if any(term in query for term in ["team", "data for", "info on", "tell me about"]) and team_mentions:
        team_num = team_mentions[0]
        response["response"] = f"Team {team_num} data is available in the Team Analysis section. Please check there for detailed information."
        response["suggested_queries"] = [
            f"What are Team {team_num}'s strengths?",
            f"How many matches has Team {team_num} played?",
            "Compare two teams"
        ]
    
    # Help request
    elif any(term in query for term in ["help", "what can you do", "how do i", "how to"]):
        response["response"] = ("I can help with team data analysis, match predictions, and scouting information. "
                               "You can ask me about specific teams, compare teams, or get advice on scouting.")
        response["suggested_queries"] = [
            "Show me top scoring teams",
            "How to use the team comparison feature",
            "Explain the ranking system"
        ]
    
    # Match predictions
    elif any(term in query for term in ["predict", "match", "alliance", "who will win"]):
        response["response"] = "Match predictions are available in the Match Predictor tab. I can help you analyze team strengths to form optimal alliances."
    
    # Scouting advice
    elif any(term in query for term in ["scout", "observe", "watch for"]):
        response["response"] = "When scouting, focus on robot capabilities, reliability, and strategy. Remember to note any special features or issues observed."
        response["suggested_queries"] = [
            "What to look for when scouting defense",
            "How to record robot breakdowns",
            "Important match metrics"
        ]
    
    # Chart request (simplified)
    elif any(term in query for term in ["chart", "graph", "plot", "visual", "compare"]):
        response["response"] = "Charts and visualizations are available in the Team Analysis section. You can generate various charts to visualize team performance."
        response["chart_type"] = "none"
    
    # Greeting
    elif any(term in query for term in ["hi", "hello", "hey", "greetings", "howdy"]):
        response["response"] = random.choice(RESPONSES["greeting"])
        
    # Jokes
    elif any(term in query for term in ["joke", "funny", "humorous", "laugh"]):
        response["response"] = random.choice(JOKES)
    
    # About Bob
    elif any(term in query for term in ["who are you", "your name", "about you"]):
        response["response"] = "I'm Bob, the AI scouting assistant for your team! I can help analyze performance data, compare teams, and provide insights for your scouting needs."
    
    # Thank you responses
    elif any(term in query for term in ["thanks", "thank you", "appreciate", "helpful"]):
        response["response"] = "You're welcome! I'm happy to help with your scouting needs. Is there anything else you'd like to know?"
    
    # For any other query
    else:
        response["response"] = "I can help with team performance analysis, match strategies, and scouting insights. Could you tell me which team you're interested in, or what specific information you need?"
        response["suggested_queries"] = [
            "Show me top teams",
            "How to use this app",
            "Explain scoring rules"
        ]
    
    return response

class AIAssistant:
    """Enhanced AI Assistant with improved conversational capabilities"""
    
    def __init__(self):
        """Initialize the AI Assistant with enhanced context tracking"""
        self.name = "Bob"
        self.memory = deque(maxlen=MEMORY_SIZE)  # Remember past interactions
        self.context = {
            "current_teams": [],
            "last_query": None,
            "current_topic": None,
            "conversation_depth": 0,
            "session_analytics": defaultdict(int),  # Track topics the user is interested in
            "mentioned_teams": set()  # Keep track of all teams mentioned in the conversation
        }
        
        # Load previous session data if available
        self.session_data_path = os.path.join(os.path.dirname(os.path.realpath(__file__)), 'bob_session_data.json')
        self.load_session_data()
        
        print(f"{self.name} AI Assistant initialized with enhanced capabilities")
    
    def load_session_data(self):
        """Load previous session data to maintain continuity between sessions"""
        try:
            if os.path.exists(self.session_data_path):
                with open(self.session_data_path, 'r') as file:
                    data = json.load(file)
                    # Update analytics with previous session data
                    for topic, count in data.get('session_analytics', {}).items():
                        self.context['session_analytics'][topic] += count
                    print(f"Loaded previous session data with {len(data.get('session_analytics', {}))} analytics entries")
        except Exception as e:
            print(f"Error loading session data: {e}")
    
    def save_session_data(self):
        """Save session data for continuity"""
        try:
            data = {
                'session_analytics': dict(self.context['session_analytics']),
                'last_updated': datetime.now().isoformat()
            }
            with open(self.session_data_path, 'w') as file:
                json.dump(data, file)
        except Exception as e:
            print(f"Error saving session data: {e}")
    
    def add_to_memory(self, query, response):
        """Add an interaction to the assistant's memory"""
        self.memory.append({
            'query': query, 
            'response': response,
            'timestamp': datetime.now().isoformat()
        })
        self.context['conversation_depth'] += 1
    
    def extract_team_numbers(self, query):
        """Extract team numbers from the query with improved pattern matching"""
        team_numbers = []
        matches = re.finditer(TEAM_NUMBER_PATTERN, query)
        for match in matches:
            number = int(match.group(1))
            if 1 <= number <= 9999:  # Valid team number range
                team_numbers.append(number)
                self.context['mentioned_teams'].add(number)
        
        return team_numbers
    
    def detect_intent(self, query):
        """Detect the user's intent from the query with enhanced NLP"""
        query_lower = query.lower()
        
        # Check for greetings
        if re.search(r'\b(hi|hello|hey|greetings|howdy)\b', query_lower):
            return "greeting"
            
        # Check for team information requests
        team_numbers = self.extract_team_numbers(query)
        if team_numbers and re.search(r'\b(info|information|about|tell me|stats|statistics|performance|how is|how are)\b', query_lower):
            if len(team_numbers) == 1:
                return "team_info"
            else:
                return "multiple_team_info"
        
        # Check for comparisons between teams
        if team_numbers and len(team_numbers) > 1 and re.search(COMPARISON_PATTERN, query_lower):
            return "compare_teams"
        
        # Check for ranking questions
        if re.search(r'\b(rank|ranking|rankings|best|top|strongest|highest)\b', query_lower):
            return "rankings"
            
        # Check for match-specific questions
        match_number = None
        match_match = re.search(MATCH_PATTERN, query_lower)
        if match_match:
            match_number = int(match_match.group(1))
            return "match_info"
        
        # Check for strategy questions
        if re.search(r'\b(strategy|strategies|approach|tactic|tactical|plan|alliance|pick|selection)\b', query_lower):
            return "strategy"
        
        # Check for jokes
        if re.search(r'\b(joke|funny|humor|laugh)\b', query_lower):
            return "joke"
        
        # Check for help/capabilities
        if re.search(r'\b(help|what can you do|capabilities|functions|assist|how to use)\b', query_lower):
            return "capabilities"
            
        # Check for thanks/appreciation
        if re.search(r'\b(thanks|thank you|appreciate|helpful|great job)\b', query_lower):
            return "thanks"
        
        # Check for questions about the assistant itself
        if re.search(r'\b(who are you|your name|about you)\b', query_lower):
            return "about_assistant"
            
        # If we can identify team numbers but not specific intent, assume team info
        if team_numbers:
            return "team_info_fallback"
            
        # Default fallback
        return "unknown"
    
    def add_personality(self, response, intent):
        """Add personality traits to make responses more engaging"""
        # Don't add personality to short responses or certain intents
        if len(response) < 20 or intent in ["greeting", "thanks", "unknown"]:
            return response
            
        for trait, data in PERSONALITY_TRAITS.items():
            if random.random() < data["frequency"]:
                phrase = random.choice(data["phrases"])
                # Find a suitable spot to insert the personality phrase
                sentences = re.split(r'(?<=[.!?])\s+', response)
                if len(sentences) > 1:
                    # Insert after the first or second sentence
                    insert_idx = min(1, len(sentences) - 1)
                    sentences[insert_idx] = f"{phrase} {sentences[insert_idx]}"
                    return " ".join(sentences)
                else:
                    # For short responses, prepend the phrase
                    return f"{phrase} {response}"
                    
        return response
    
    def generate_response(self, query, conversation_history=None, team_data=None):
        """Generate a response based on the query and current context"""
        
        # Update context with any provided team data
        if team_data:
            self.context['current_teams'] = team_data
            for team in team_data:
                self.context['mentioned_teams'].add(team)
        
        # Detect the user's intent
        intent = self.detect_intent(query)
        
        # Track topics the user is interested in
        self.context['session_analytics'][intent] += 1
        
        # Extract team numbers from the query
        team_numbers = self.extract_team_numbers(query)
        
        # Update the context
        self.context['last_query'] = query
        self.context['current_topic'] = intent
        if team_numbers:
            self.context['current_teams'] = team_numbers
        
        # Generate response based on intent
        response = ""
        
        if intent == "greeting":
            response = random.choice(RESPONSES["greeting"])
        
        elif intent == "team_info" or intent == "team_info_fallback":
            if team_numbers:
                team_number = team_numbers[0]
                response = random.choice(RESPONSES["team_info"]).format(team_number)
                # Add placeholder for team data that would come from the actual database
                response += f"\n\nTeam {team_number} data would be displayed here. You can ask me specific questions about their performance metrics."
            else:
                response = "I didn't catch which team you're asking about. Could you specify the team number?"
        
        elif intent == "multiple_team_info":
            teams_str = ", ".join(map(str, team_numbers))
            response = random.choice(RESPONSES["team_info"]).format(teams_str)
            response += f"\n\nI'll show you data for teams {teams_str}. What specific metrics are you interested in?"
        
        elif intent == "compare_teams":
            teams_str = ", ".join(map(str, team_numbers))
            response = random.choice(RESPONSES["compare_intro"]).format(teams_str)
            response += f"\n\nComparison data for teams {teams_str} would be shown here."
            
            # Add more insights for a smarter comparison
            response += "\n\nWhen comparing teams, I look at several key metrics:"
            response += "\n- Scoring capability in auto and teleop phases"
            response += "\n- Consistency across matches"
            response += "\n- Defense capabilities"
            response += "\n- Specialized features like endgame actions"
            
            # Add some simulated insights
            if len(team_numbers) >= 2:
                response += f"\n\nFor example, Team {team_numbers[0]} might excel at autonomous scoring, while Team {team_numbers[1]} might be stronger in teleop."
        
        elif intent == "rankings":
            response = "Here's the current team ranking based on overall performance:"
            response += "\n\n[Ranking data would be displayed here]"
            response += "\n\nThese rankings take into account autonomous performance, teleop scoring, and endgame points."
        
        elif intent == "match_info":
            match_match = re.search(MATCH_PATTERN, query.lower())
            if match_match:
                match_number = match_match.group(1)
                response = f"Here's the information for match {match_number}:"
                response += f"\n\n[Match {match_number} data would be displayed here]"
                if team_numbers:
                    response += f"\n\nI can show you specifically how team {team_numbers[0]} performed in this match if you'd like."
            else:
                response = "Which match number are you interested in?"
        
        elif intent == "strategy":
            if team_numbers:
                teams_str = ", ".join(map(str, team_numbers))
                response = f"Let's talk strategy for team(s) {teams_str}."
                response += "\n\nWhen developing a strategy, I consider:"
                response += "\n- Team specializations and strengths"
                response += "\n- Complementary alliance members"
                response += "\n- Opponent capabilities"
                response += "\n- Match objectives and scoring opportunities"
            else:
                response = "I can help you develop strategies based on team data. Which teams are you interested in?"
        
        elif intent == "joke":
            response = random.choice(JOKES)
            # Don't add personality traits to jokes
            return response
        
        elif intent == "capabilities":
            response = f"I'm {self.name}, your AI scouting assistant. Here's what I can help you with:"
            response += "\n- Provide information about specific teams"
            response += "\n- Compare multiple teams' performance"
            response += "\n- Show team rankings"
            response += "\n- Analyze match data"
            response += "\n- Suggest alliance selections and strategies"
            response += "\n- Answer questions about scouting metrics"
            response += "\n\nJust ask me about any team by their number, or ask to compare teams!"
        
        elif intent == "thanks":
            response = "You're welcome! I'm happy to help with your scouting needs. Is there anything else you'd like to know?"
        
        elif intent == "about_assistant":
            response = f"I'm {self.name}, an AI scouting assistant designed to help you analyze team performance data and make strategic decisions for your robotics competitions. I can provide information about teams, compare performance metrics, suggest strategies, and more!"
        
        else:
            # Use the fallback response if we don't understand the query
            response = random.choice(RESPONSES["unknown"])
        
        # Add personality traits to the response
        response = self.add_personality(response, intent)
        
        # Add to memory
        self.add_to_memory(query, response)
        
        # Save session data periodically
        if random.random() < 0.1:  # 10% chance on each response
            self.save_session_data()
            
        return response

def process_ai_query(query, conversation_history=None, team_mentions=None):
    """Process an AI query and return a response"""
    # Use rule-based approach for all queries
    return get_rule_based_response(query, conversation_history, team_mentions)
