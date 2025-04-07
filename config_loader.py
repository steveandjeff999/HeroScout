import os
import json
import re
import threading
import time
import logging

# Set up logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger('ConfigLoader')

class ConfigLoader:
    def __init__(self, config_path='static/js/config.js'):
        self.config_path = config_path
        self.config = {
            'server': {
                'port': 5454,  # Default port as fallback
                'scanner_device': True,
                'data_refresh_interval': 150
            },
            'ai': {
                'use_local_model': True,
                'use_dynamic_generation': True,
                'openai_api_key': '',
                'openai_model': 'gpt-3.5-turbo',
                'local_model': 'facebook/blenderbot-400M-distill'
            }
        }  # Default config with minimum required settings
        self.config_lock = threading.Lock()
        self.last_load_time = 0
        self.load_config()
        
        # Start background thread to monitor for config changes
        self.monitor_thread = threading.Thread(target=self._monitor_config_changes, daemon=True)
        self.monitor_thread.start()
    
    def load_config(self):
        """Load configuration from the JavaScript config file"""
        try:
            script_dir = os.path.dirname(os.path.realpath(__file__))
            full_path = os.path.join(script_dir, self.config_path)
            
            if not os.path.exists(full_path):
                logger.error(f"Config file not found: {full_path}")
                return False
                
            with open(full_path, 'r', encoding='utf-8') as file:
                js_content = file.read()
            
            # Extract the JSON configuration from JavaScript
            config_match = re.search(r'const\s+GAME_CONFIG\s*=\s*({[\s\S]*?});', js_content)
            if not config_match:
                logger.error("Could not find GAME_CONFIG in the JavaScript file")
                return False
                
            config_json = config_match.group(1)
            
            # Save the raw extracted JSON for debugging before processing
            debug_file_raw = os.path.join(script_dir, "config_raw.json")
            with open(debug_file_raw, "w", encoding="utf-8") as f:
                f.write(config_json)
            
            # Try parsing directly with json5 if available (most robust method)
            try:
                import json5
                parsed_config = json5.loads(config_json)
                with self.config_lock:
                    self.config = parsed_config
                    self.last_load_time = os.path.getmtime(full_path)
                    logger.info("Configuration loaded successfully using json5")
                return True
            except ImportError:
                # json5 not available, fall back to regex processing
                logger.warning("json5 not available, using regex-based processing")
            except Exception as e:
                logger.error(f"json5 parsing failed: {str(e)}, falling back to regex processing")
            
            # Step 1: Remove JavaScript comments (both single and multi-line)
            # First remove multi-line comments
            config_json = re.sub(r'/\*[\s\S]*?\*/', '', config_json)
            # Then remove single-line comments
            config_json = re.sub(r'//.*?$', '', config_json, flags=re.MULTILINE)
            
            # Step 2: Remove all control characters that may cause JSON parsing issues
            config_json = ''.join(ch for ch in config_json if ord(ch) >= 32 or ch in '\n\r\t')
            
            # Step 3: Use a more reliable method to ensure property names are in double quotes
            # First make all keys double-quoted
            config_json = re.sub(r'([{,])\s*([a-zA-Z0-9_$]+)\s*:', r'\1"\2":', config_json)
            
            # Step 4: Replace single quotes with double quotes for strings, but be careful with nested quotes
            # This is complex; we'll use a simpler approach to start
            config_json = re.sub(r"'([^']*?)'", r'"\1"', config_json)
            
            # Step 5: Fix trailing commas which are valid in JS but not in JSON
            config_json = re.sub(r',(\s*[}\]])', r'\1', config_json)
            
            # Save the processed JSON for debugging
            debug_file_processed = os.path.join(script_dir, "config_processed.json")
            with open(debug_file_processed, "w", encoding="utf-8") as f:
                f.write(config_json)
            
            try:
                parsed_config = json.loads(config_json)
                with self.config_lock:
                    self.config = parsed_config
                    self.last_load_time = os.path.getmtime(full_path)
                    logger.info("Configuration loaded successfully using standard json")
                return True
            except json.JSONDecodeError as e:
                logger.error(f"JSON parse error: {str(e)}")
                
                # Last resort: Use Python's eval in a controlled way
                try:
                    # This is somewhat dangerous, but we're doing it as a last resort
                    # and only on files we control
                    import ast
                    
                    # First, make the JS object compatible with Python
                    config_py = config_json.replace('true', 'True').replace('false', 'False').replace('null', 'None')
                    
                    # Use ast.literal_eval which is safer than eval
                    parsed_config = ast.literal_eval(config_py)
                    
                    with self.config_lock:
                        self.config = parsed_config
                        self.last_load_time = os.path.getmtime(full_path)
                        logger.info("Configuration loaded successfully using ast.literal_eval")
                    return True
                except Exception as e2:
                    logger.error(f"Failed to parse with all methods: {str(e2)}")
                return False
                
        except Exception as e:
            logger.error(f"Error loading configuration: {str(e)}")
            return False
    
    def _monitor_config_changes(self):
        """Monitor the config file for changes and reload when needed"""
        while True:
            try:
                script_dir = os.path.dirname(os.path.realpath(__file__))
                full_path = os.path.join(script_dir, self.config_path)
                
                if os.path.exists(full_path):
                    current_mtime = os.path.getmtime(full_path)
                    if current_mtime > self.last_load_time:
                        logger.info("Configuration file changed, reloading...")
                        self.load_config()
            except Exception as e:
                logger.error(f"Error checking for config changes: {str(e)}")
                
            # Check for changes every 5 seconds
            time.sleep(5)
    
    def get_config(self):
        """Get the current configuration"""
        with self.config_lock:
            return self.config.copy()
    
    def get_value(self, key, default=None, section=None):
        """
        Get a specific configuration value
        
        Args:
            key (str): The configuration key to retrieve
            default: The default value to return if key is not found
            section (str, optional): The section within the configuration to look in
            
        Returns:
            The configuration value or default if not found
        """
        with self.config_lock:
            if section:
                return self.config.get(section, {}).get(key, default)
            return self.config.get(key, default)

# Create a global instance of ConfigLoader
config_loader = ConfigLoader()
