import openai
import json
import logging
from typing import Dict, Any, List

class ConstraintParser:
    def __init__(self, openai_api_key: str):
        self.client = openai.OpenAI(api_key=openai_api_key)
        
    def parse_constraints(self, raw_constraints: str, team_context: Dict[str, Any]) -> Dict[str, Any]:
        """
        Parse raw constraint text into structured constraints using OpenAI
        """
        try:
            # Create a prompt to parse constraints
            prompt = f"""
You are a constraint parser for medical shift scheduling. Convert the following constraints into structured data.

Team Context:
- Team members: {', '.join([m['name'] for m in team_context.get('members', [])])}
- Shifts: {', '.join([s['name'] for s in team_context.get('shifts', [])])}

Raw Constraints:
{raw_constraints}

Parse these constraints into the following JSON structure:
{{
  "availability_rules": [
    {{
      "type": "unavailable_dates",
      "member_name": "string",
      "shift_names": ["string"],
      "date_ranges": ["YYYY-MM-DD to YYYY-MM-DD"],
      "reason": "string"
    }}
  ],
  "shift_rules": [
    {{
      "type": "no_consecutive_nights",
      "enabled": true,
      "min_rest_hours": 24
    }},
    {{
      "type": "max_consecutive_days",
      "value": 5
    }},
    {{
      "type": "workers_per_shift",
      "value": 2
    }}
  ],
  "member_rules": [
    {{
      "type": "date_restriction",
      "member_name": "string",
      "allowed_dates": ["YYYY-MM-DD to YYYY-MM-DD"],
      "restricted_dates": ["YYYY-MM-DD to YYYY-MM-DD"]
    }},
    {{
      "type": "shift_preference",
      "member_name": "string",
      "preferred_shifts": ["string"],
      "avoided_shifts": ["string"]
    }}
  ],
  "team_rules": [
    {{
      "type": "fair_distribution",
      "enabled": true,
      "max_variance": 2
    }},
    {{
      "type": "min_assignments_per_member",
      "value": 3
    }}
  ]
}}

Return ONLY valid JSON, no additional text or explanation.
"""
            
            response = self.client.chat.completions.create(
                model="gpt-4o",
                messages=[{"role": "user", "content": prompt}],
                temperature=0,
                max_tokens=1000
            )
            
            content = response.choices[0].message.content
            if not content:
                raise ValueError("No response from OpenAI")
            
            # Extract JSON from response
            json_content = content.strip()
            if json_content.startswith('```json'):
                json_content = json_content[7:]
            if json_content.endswith('```'):
                json_content = json_content[:-3]
            
            parsed_constraints = json.loads(json_content.strip())
            
            # Validate the parsed structure
            self._validate_parsed_constraints(parsed_constraints)
            
            return parsed_constraints
            
        except Exception as e:
            logging.error(f"Error parsing constraints: {str(e)}")
            # Return default constraints if parsing fails
            return self._get_default_constraints()
    
    def _validate_parsed_constraints(self, constraints: Dict[str, Any]):
        """Validate the parsed constraints structure"""
        required_sections = ['availability_rules', 'shift_rules', 'member_rules', 'team_rules']
        for section in required_sections:
            if section not in constraints:
                constraints[section] = []
            if not isinstance(constraints[section], list):
                constraints[section] = []
    
    def _get_default_constraints(self) -> Dict[str, Any]:
        """Return default constraints if parsing fails"""
        return {
            "availability_rules": [],
            "shift_rules": [
                {
                    "type": "no_consecutive_nights",
                    "enabled": True,
                    "min_rest_hours": 24
                },
                {
                    "type": "max_consecutive_days",
                    "value": 5
                },
                {
                    "type": "workers_per_shift",
                    "value": 1
                }
            ],
            "member_rules": [],
            "team_rules": [
                {
                    "type": "fair_distribution",
                    "enabled": True,
                    "max_variance": 2
                },
                {
                    "type": "min_assignments_per_member",
                    "value": 3
                }
            ]
        }
    
    def merge_with_database_constraints(self, parsed_constraints: Dict[str, Any], db_constraints: Dict[str, Any]) -> Dict[str, Any]:
        """
        Merge parsed constraints with database constraints
        """
        merged = parsed_constraints.copy()
        
        # Merge shift rules
        if db_constraints.get('max_consecutive_days'):
            # Note: This constraint limits the maximum number of consecutive shifts in a row per worker
            # The name "max_consecutive_days" is kept for database compatibility
            merged['shift_rules'].append({
                "type": "max_consecutive_days",
                "value": db_constraints['max_consecutive_days']
            })
        
        if db_constraints.get('min_rest_hours'):
            merged['shift_rules'].append({
                "type": "min_rest_hours",
                "value": db_constraints['min_rest_hours']
            })
        
        if db_constraints.get('workers_per_shift'):
            merged['shift_rules'].append({
                "type": "workers_per_shift",
                "value": db_constraints['workers_per_shift']
            })
        
        if db_constraints.get('max_days_per_month'):
            # Note: This constraint limits the total number of shift assignments per worker per month
            # The name "max_days_per_month" is kept for database compatibility
            merged['shift_rules'].append({
                "type": "max_days_per_month",
                "value": db_constraints['max_days_per_month']
            })
        
        return merged
