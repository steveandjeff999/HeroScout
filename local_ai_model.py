"""
Local AI Model module for DLDScout
Provides text generation capabilities using locally-run models
"""
import os
import time
import logging
import threading
import random
from pathlib import Path

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger('LocalAIModel')

class LocalAIHandler:
    def __init__(self):
        self.model = None
        self.tokenizer = None
        self.model_name = "microsoft/DialoGPT-small"  # Default smaller model
        self.model_loaded = False
        self.is_loading = False
        self.model_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "models")
        self.loading_start_time = None
        self.loading_timeout = 300  # 5 minutes timeout for loading
        
        # Create models directory if it doesn't exist
        if not os.path.exists(self.model_dir):
            os.makedirs(self.model_dir)
        
        # Add built-in responses dictionary for common queries
        self.built_in_responses = {
            'hi': [
                "Hello! I'm Bob, your scouting assistant. How can I help you today?",
                "Hi there! I'm Bob. What would you like to know about team performance?"
            ],
            'hello': [
                "Hello! I'm Bob, your scouting assistant. How can I help you today?",
                "Hi there! I'm Bob. What would you like to know about team performance?"
            ],
            'hey': [
                "Hey! I'm Bob, your scouting assistant. How can I help you today?",
                "Hey there! What team data would you like to analyze?"
            ],
            'who are you': [
                "I'm Bob, the AI scouting assistant! I can help you analyze team data, compare performances, and provide insights for your scouting needs."
            ],
            'what can you do': [
                "I can help you analyze team performance data, compare teams, create visualizations, and provide scouting insights. Just ask me about specific teams or metrics!"
            ],
            'help': [
                "I can assist with team analysis, comparisons, and scouting insights. Try asking about a specific team like 'Tell me about team 5454' or 'Compare teams 1234 and 5678'."
            ]
        }
        
        # Initialize for simulation mode as fallback
        self.simulation_mode = False
        self.reduced_capabilities_warning_shown = False
        
        # Start model initialization in a background thread
        self.init_thread = threading.Thread(target=self._initialize_model)
        self.init_thread.daemon = True
        self.init_thread.start()
    
    def _initialize_model(self):
        """Initialize the model in a background thread to avoid blocking startup"""
        self.is_loading = True
        self.loading_start_time = time.time()
        try:
            logger.info(f"Loading local AI model: {self.model_name}")
            
            # Import here to avoid slowing down startup if transformers is not used
            try:
                from transformers import AutoModelForCausalLM, AutoTokenizer, BlenderbotForConditionalGeneration, BlenderbotTokenizer
                import torch
                
                # Verify imports succeeded
                logger.info("Successfully imported transformers and torch")
            except ImportError as e:
                logger.error(f"Transformers or torch library not installed: {e}")
                self.is_loading = False
                self.simulation_mode = True  # Fallback to simulation mode
                return
            
            # Check if GPU is available and has enough memory
            if torch.cuda.is_available() and torch.cuda.get_device_properties(0).total_memory > 4e9:  # 4GB
                device = "cuda"
                logger.info("Using GPU for inference")
            else:
                device = "cpu"
                logger.info("Using CPU for inference")
            
            # Log memory status before loading model
            if device == "cuda":
                logger.info(f"Available GPU memory before loading: {torch.cuda.get_device_properties(0).total_memory / 1e9:.2f} GB")
            
            # Determine which model type we're loading
            try:
                if "blenderbot" in self.model_name:
                    logger.info("Loading BlenderBot tokenizer...")
                    self.tokenizer = BlenderbotTokenizer.from_pretrained(
                        self.model_name, 
                        cache_dir=self.model_dir,
                        local_files_only=False
                    )
                    logger.info("BlenderBot tokenizer loaded, now loading model...")
                    self.model = BlenderbotForConditionalGeneration.from_pretrained(
                        self.model_name, 
                        cache_dir=self.model_dir,
                        local_files_only=False
                    )
                    logger.info("BlenderBot model loaded successfully")
                else:
                    logger.info("Loading AutoTokenizer...")
                    self.tokenizer = AutoTokenizer.from_pretrained(
                        self.model_name, 
                        cache_dir=self.model_dir,
                        local_files_only=False
                    )
                    logger.info("AutoTokenizer loaded, now loading model...")
                    self.model = AutoModelForCausalLM.from_pretrained(
                        self.model_name, 
                        cache_dir=self.model_dir,
                        local_files_only=False
                    )
                    logger.info("Model loaded successfully")
                
                # Move model to the appropriate device
                logger.info(f"Moving model to {device}...")
                self.model = self.model.to(device)
                self.model_loaded = True
                logger.info(f"Model {self.model_name} loaded successfully and ready for inference")
                
                # Quick validation test
                logger.info("Running validation test...")
                validation_result = self._validation_test()
                if not validation_result:
                    logger.warning("Validation test failed, falling back to simulation mode")
                    self.simulation_mode = True
                else:
                    logger.info("Validation test passed")
                
            except Exception as e:
                logger.error(f"Error during model loading: {e}", exc_info=True)
                self.simulation_mode = True  # Fallback to simulation mode
        
        except Exception as e:
            logger.error(f"Error in model initialization: {e}", exc_info=True)
            self.simulation_mode = True  # Fallback to simulation mode
        finally:
            self.is_loading = False
            
            # Log final status
            if self.model_loaded:
                logger.info("Model initialization completed successfully")
            else:
                logger.warning("Model initialization failed, operating in simulation mode")
    
    def _validation_test(self):
        """Run a simple validation test to ensure the model works properly"""
        try:
            test_input = "Hello, how are you?"
            if "blenderbot" in self.model_name and self.tokenizer and self.model:
                inputs = self.tokenizer([test_input], return_tensors="pt").to(self.model.device)
                outputs = self.model.generate(**inputs, max_length=30)
                result = self.tokenizer.batch_decode(outputs, skip_special_tokens=True)
                return len(result) > 0 and len(result[0]) > 0
            elif self.tokenizer and self.model:
                inputs = self.tokenizer(test_input, return_tensors="pt").to(self.model.device)
                outputs = self.model.generate(**inputs, max_length=30)
                result = self.tokenizer.decode(outputs[0], skip_special_tokens=True)
                return len(result) > 0
            return False
        except Exception as e:
            logger.error(f"Validation test failed: {e}", exc_info=True)
            return False
    
    def is_ready(self):
        """Check if the model is ready to use"""
        return self.model_loaded or self.simulation_mode
    
    def is_loading_timed_out(self):
        """Check if model loading has timed out"""
        if not self.is_loading or not self.loading_start_time:
            return False
        
        return time.time() - self.loading_start_time > self.loading_timeout
    
    def check_built_in_response(self, prompt):
        """Check if we have a built-in response for this prompt"""
        prompt_lower = prompt.lower().strip()
        
        # Check for direct matches
        for key, responses in self.built_in_responses.items():
            if key in prompt_lower:
                return random.choice(responses)
        
        # Check for team number queries
        if "team" in prompt_lower and any(str(i) in prompt_lower for i in range(10)):
            team_num = None
            for word in prompt_lower.split():
                if word.isdigit():
                    team_num = word
                    break
            
            if team_num:
                return f"I'd be happy to tell you about Team {team_num}! What specific information would you like to know about their performance?"
        
        # For anything else, return None
        return None
        
    def generate_text(self, prompt, max_length=100):
        """Generate text based on the prompt"""
        # First check if we're in simulation mode or if we should use built-in responses
        built_in = self.check_built_in_response(prompt)
        if built_in:
            logger.info(f"Using built-in response for: {prompt}")
            return built_in
        
        # Show reduced capabilities warning if in simulation mode
        if self.simulation_mode and not self.reduced_capabilities_warning_shown:
            self.reduced_capabilities_warning_shown = True
            return "I'm currently operating with reduced capabilities because the AI model couldn't be loaded. I'll do my best to help with basic questions, but advanced analysis may not be available."
        
        if not self.model_loaded:
            if self.simulation_mode:
                return "I understand you're asking about something, but I'm running in basic mode. Feel free to ask about specific team data instead, and I'll try to help with the data I have access to."
            
            if self.is_loading:
                return "I'm still loading my brain. Please try again in a moment."
            else:
                try:
                    # Try to load the model synchronously if it failed earlier
                    self._initialize_model()
                    if not self.model_loaded:
                        return "I'm having trouble accessing my knowledge. Please check if the model is properly installed."
                except Exception as e:
                    logger.error(f"Error during synchronous model loading: {e}", exc_info=True)
                    return "I can't seem to think properly right now. Please check if the transformers library is installed."
        
        # Now try to generate a response using the model
        try:
            # Safely truncate prompt if too long to avoid issues
            max_input_length = 512  # Safe limit for most models
            if len(prompt) > max_input_length:
                logger.warning(f"Truncating input prompt from {len(prompt)} to {max_input_length} characters")
                prompt = prompt[:max_input_length]
            
            # Handle the input differently based on model type
            if "blenderbot" in self.model_name:
                try:
                    # Ensure we're using a list with a single string
                    if not isinstance(prompt, list):
                        prompt_list = [prompt]
                    else:
                        prompt_list = prompt
                    
                    inputs = self.tokenizer(prompt_list, return_tensors="pt", padding=True, truncation=True).to(self.model.device)
                    logger.info(f"BlenderBot inputs shape: {inputs['input_ids'].shape}")
                    
                    # Generate with parameters tuned for stability
                    reply_ids = self.model.generate(
                        **inputs, 
                        max_length=max_length,
                        min_length=10,
                        num_return_sequences=1,
                        temperature=0.8,
                        top_p=0.9,
                        repetition_penalty=1.2,
                        no_repeat_ngram_size=2
                    )
                    
                    if reply_ids.shape[0] > 0:
                        response = self.tokenizer.batch_decode(reply_ids, skip_special_tokens=True)[0]
                        logger.info(f"Generated response: {response[:50]}...")
                        return response
                    else:
                        logger.error("Generation produced empty output")
                        return "I'm sorry, I couldn't formulate a response. Could you try rephrasing your question?"
                    
                except IndexError as idx_err:
                    logger.error(f"Index error during Blenderbot text generation: {idx_err}", exc_info=True)
                    return "I'm currently having trouble processing complex requests. Could you try asking a simpler question?"
                except Exception as e:
                    logger.error(f"Error during Blenderbot text generation: {e}", exc_info=True)
                    return "I had trouble processing that request. Could you try a simpler question?"
            else:
                # For causal language models like GPT-2
                try:
                    inputs = self.tokenizer(prompt, return_tensors="pt", padding=True, truncation=True).to(self.model.device)
                    logger.info(f"GPT inputs shape: {inputs['input_ids'].shape}")
                    
                    output = self.model.generate(
                        **inputs,
                        max_length=max_length,
                        min_length=10,
                        num_return_sequences=1,
                        temperature=0.7,
                        top_p=0.9,
                        repetition_penalty=1.2,
                        no_repeat_ngram_size=2
                    )
                    
                    if output.shape[0] > 0:
                        response = self.tokenizer.decode(output[0], skip_special_tokens=True)
                        
                        # Remove the original prompt from the response if needed
                        if response.startswith(prompt):
                            response = response[len(prompt):].strip()
                        
                        logger.info(f"Generated response: {response[:50]}...")
                        return response
                    else:
                        logger.error("Generation produced empty output")
                        return "I'm sorry, I couldn't formulate a response. Could you try rephrasing your question?"
                    
                except IndexError as idx_err:
                    logger.error(f"Index error during GPT text generation: {idx_err}", exc_info=True)
                    return "I'm currently having trouble processing complex requests. Could you try asking a simpler question?"
                except Exception as e:
                    logger.error(f"Error during GPT text generation: {e}", exc_info=True)
                    return "I had trouble processing that request. Could you try a simpler question?"
            
        except Exception as e:
            logger.error(f"Unexpected error in generate_text: {e}", exc_info=True)
            return "I encountered an unexpected error. Let's try something else - you can ask me about specific team performance data instead."

# Create a singleton instance
local_ai_handler = LocalAIHandler()

def is_model_ready():
    """Check if the model is ready for use"""
    return local_ai_handler.is_ready()

def generate_text(prompt, system_prompt=None, conversation_history=None):
    """Generate text using local model with a format similar to OpenAI's interface"""
    try:
        # Check if the model is in simulation mode and handle accordingly
        if hasattr(local_ai_handler, 'simulation_mode') and local_ai_handler.simulation_mode:
            # Check for built-in responses first
            built_in = local_ai_handler.check_built_in_response(prompt)
            if built_in:
                return built_in
                
            # Try to extract team numbers from the prompt
            import re
            team_numbers = re.findall(r'team\s+(\d+)|(\d+)\s+team', prompt.lower())
            flattened_teams = []
            for match in team_numbers:
                flattened_teams.extend([num for num in match if num])
            
            # Return templated responses based on the query content
            if flattened_teams:
                teams_str = ", ".join(flattened_teams)
                return f"I see you're asking about Team {teams_str}. In my current mode, I can't perform advanced analysis, but I can help you find basic information about them if you have specific questions."
            
            if "compare" in prompt.lower():
                return "I'd like to help you compare teams, but I'm currently running in basic mode. You can still use the team comparison tool in the interface to see detailed performance data."
            
            if "strategy" in prompt.lower():
                return "Strategy development is important! While I'm in basic mode, I can suggest focusing on teams with complementary capabilities - strong autonomous performers paired with good endgame climbers often make good alliance partners."
                
            # Generic fallback for simulation mode
            return "I understand you're asking for assistance. While I'm running in basic mode, I can still help with simple questions about teams and scouting. Feel free to ask about specific team numbers."
        
        # Prepare the full prompt with conversation history
        formatted_prompt = ""
        
        # Add system prompt if available
        if system_prompt:
            formatted_prompt += f"System: {system_prompt}\n\n"
        
        # Add conversation history (limited to last 3 exchanges to avoid context length issues)
        if conversation_history:
            recent_history = conversation_history[-6:] if len(conversation_history) > 6 else conversation_history
            for message in recent_history:
                role = message.get("role", "user")
                content = message.get("content", "")
                if role == "user":
                    formatted_prompt += f"User: {content}\n"
                else:
                    formatted_prompt += f"Assistant: {content}\n"
        
        # Add the current prompt
        formatted_prompt += f"User: {prompt}\nAssistant:"
        
        # Check for loading timeout and provide feedback
        if local_ai_handler.is_loading_timed_out():
            return "I've been trying to load my thinking module for a while but I'm having some trouble. You might want to check if your computer has enough resources or try restarting the application."
        
        # Generate response with a maximum length limit to avoid errors
        max_length = min(len(formatted_prompt) + 200, 1000)  # Reasonable length limit
        response = local_ai_handler.generate_text(formatted_prompt, max_length)
        
        # If response is empty or just whitespace, provide a fallback
        if not response or response.strip() == "":
            # Check for built-in responses as a fallback
            built_in = local_ai_handler.check_built_in_response(prompt)
            if built_in:
                return built_in
            return "I understand your question but I'm struggling to formulate a good response right now. Could you try rephrasing or asking about something else?"
        
        return response
    except Exception as e:
        logger.error(f"Error in generate_text wrapper: {e}", exc_info=True)
        # Provide a helpful fallback instead of just an error message
        built_in = local_ai_handler.check_built_in_response(prompt) if hasattr(local_ai_handler, 'check_built_in_response') else None
        if built_in:
            return built_in
        return "I'm here to help with team analysis and scouting. While I'm having some technical difficulties, you can ask me about specific teams or scouting strategies and I'll do my best to assist."

