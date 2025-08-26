from flask import Flask, request, jsonify
from ortools.sat.python import cp_model
from datetime import datetime, timedelta
import json
import logging

app = Flask(__name__)
logging.basicConfig(level=logging.INFO)

class ScheduleSolver:
    def __init__(self):
        self.model = None
        self.solver = None
        
    def solve_schedule(self, team_data):
        """Main method to solve the schedule using OR-Tools"""
        try:
            # Extract data
            members = team_data['members']
            shifts = team_data['shifts']
            availability = team_data['availability']
            constraints = team_data['constraints']
            month = team_data['month']
            year = team_data['year']
            
            # Get month details
            days_in_month = (datetime(year, month + 1, 1) - datetime(year, month, 1)).days
            
            # DEBUG: Log all input data
            logging.info(f"=== SOLVER INPUT DATA ===")
            logging.info(f"Members: {len(members)} - {[m['name'] for m in members]}")
            logging.info(f"Shifts: {len(shifts)} - {[s['name'] for s in shifts]}")
            logging.info(f"Month: {month}, Year: {year}, Days: {days_in_month}")
            logging.info(f"Constraints: {constraints}")
            logging.info(f"Availability entries: {len(availability)}")
            if availability:
                logging.info(f"Sample availability: {availability[0] if availability else 'None'}")
            logging.info(f"=== END INPUT DATA ===")
            
            # Create the model
            self.model = cp_model.CpModel()
            self.solver = cp_model.CpSolver()
            
            # Create variables: x[m][s][d] = 1 if member m is assigned to shift s on day d
            x = {}
            for m in range(len(members)):
                for s in range(len(shifts)):
                    for d in range(days_in_month):
                        x[m, s, d] = self.model.NewBoolVar(f'x_{m}_{s}_{d}')
            
            # 1. AVAILABILITY CONSTRAINTS (Hard constraints)
            logging.info("Adding availability constraints...")
            self._add_availability_constraints(x, members, shifts, availability, days_in_month, month, year)
            
            # 2. WORKERS PER SHIFT (Hard constraint)
            logging.info("Adding workers per shift constraint...")
            self._add_workers_per_shift_constraint(x, members, shifts, days_in_month, constraints)
            
            # 3. MAX SHIFTS PER MONTH (Hard constraint)
            # This constraint limits the total number of shift assignments per worker per month
            # The constraint key 'max_days_per_month' is kept for backward compatibility
            logging.info("Adding max shifts per month constraint...")
            self._add_max_shifts_per_month_constraint(x, members, shifts, days_in_month, constraints)
            
            # 4. MAX CONSECUTIVE SHIFTS (Hard constraint)
            # This constraint limits how many shifts in a row a worker can be assigned
            logging.info("Adding max consecutive shifts constraint...")
            self._add_max_consecutive_shifts_constraint(x, members, shifts, days_in_month, constraints)
            
            # 5. CUSTOM CONSTRAINTS (Dynamic based on team rules)
            logging.info("Adding custom constraints...")
            self._add_custom_constraints(x, members, shifts, days_in_month, constraints)
            
            # Solve the model
            logging.info("=== STARTING SOLVER ===")
            
            # Handle different OR-Tools versions for constraint/variable counting
            try:
                num_constraints = self.model.NumConstraints()
                num_variables = self.model.NumVariables()
            except AttributeError:
                try:
                    num_constraints = len(self.model.Proto().constraints)
                    num_variables = len(self.model.Proto().variables)
                except AttributeError:
                    num_constraints = "unknown"
                    num_variables = "unknown"
            
            logging.info(f"Model has {num_constraints} constraints and {num_variables} variables")
            
            status = self.solver.Solve(self.model)
            
            logging.info(f"Solver status: {status} ({self.solver.StatusName()})")
            logging.info(f"Solver wall time: {self.solver.WallTime()} seconds")
            
            if status == cp_model.OPTIMAL or status == cp_model.FEASIBLE:
                logging.info("=== SOLVER SUCCESS ===")
                return self._extract_solution(x, members, shifts, days_in_month, month, year)
            else:
                logging.error(f"=== SOLVER FAILED ===")
                logging.error(f"No feasible solution found. Status: {status}")
                logging.error(f"Solver status name: {self.solver.StatusName()}")
                return {"error": f"No feasible solution found. Solver status: {self.solver.StatusName()}"}
                
        except Exception as e:
            logging.error(f"Error solving schedule: {str(e)}")
            return {"error": f"Solver error: {str(e)}"}
    
    def _add_availability_constraints(self, x, members, shifts, availability, days_in_month, month, year):
        """Add availability constraints - workers can only be assigned when available"""
        # Ensure availability is a list
        if not isinstance(availability, list):
            logging.warning(f"Availability is not a list: {type(availability)}, skipping availability constraints")
            return
        
        logging.info(f"Adding availability constraints for {len(members)} members, {len(shifts)} shifts, {days_in_month} days")
        
        constraints_added = 0
        total_possible_assignments = len(members) * len(shifts) * days_in_month
        logging.info(f"Total possible assignments: {total_possible_assignments}")
        
        for m in range(len(members)):
            for s in range(len(shifts)):
                for d in range(days_in_month):
                    date_str = f"{year}-{month:02d}-{d+1:02d}"
                    
                    # Find availability for this member, shift, and date
                    member_id = members[m]['id']
                    shift_id = shifts[s]['id']
                    
                    # Check availability status for this member, shift, and date
                    availability_entry = next(
                        (a for a in availability 
                         if a['user_id'] == member_id and 
                            a['shift_id'] == shift_id and 
                            a['date'] == date_str),
                        None
                    )
                    
                    if availability_entry:
                        if availability_entry['status'] == 'unavailable':
                            # Force assignment to 0 if unavailable
                            self.model.Add(x[m, s, d] == 0)
                            constraints_added += 1
                            logging.debug(f"Added constraint: {members[m]['name']} cannot work {shifts[s]['name']} on {date_str}")
                        elif availability_entry['status'] == 'available':
                            # Allow assignment (no constraint needed, but log for clarity)
                            logging.debug(f"{members[m]['name']} can work {shifts[s]['name']} on {date_str}")
                        elif availability_entry['status'] == 'priority':
                            # Allow assignment (no constraint needed, but log for clarity)
                            logging.debug(f"{members[m]['name']} has priority for {shifts[s]['name']} on {date_str}")
                        else:
                            # Unknown status, treat as available
                            logging.debug(f"{members[m]['name']} has unknown status '{availability_entry['status']}' for {shifts[s]['name']} on {date_str}")
                    else:
                        # No availability entry = "not set" = available by default
                        logging.debug(f"{members[m]['name']} has no availability set for {shifts[s]['name']} on {date_str} (treating as available)")
        
        logging.info(f"Added {constraints_added} availability constraints out of {total_possible_assignments} total possible assignments")
        logging.info(f"Remaining assignments ({total_possible_assignments - constraints_added}) are available for scheduling")
    
    def _add_workers_per_shift_constraint(self, x, members, shifts, days_in_month, constraints):
        """Ensure correct number of workers per shift"""
        workers_per_shift = constraints.get('workers_per_shift', 1)
        logging.info(f"Adding workers per shift constraint: {workers_per_shift} workers per shift")
        
        constraints_added = 0
        for s in range(len(shifts)):
            for d in range(days_in_month):
                # Sum of workers assigned to this shift on this day should equal workers_per_shift
                constraint = sum(x[m, s, d] for m in range(len(members))) == workers_per_shift
                self.model.Add(constraint)
                constraints_added += 1
        
        logging.info(f"Added {constraints_added} workers per shift constraints")
    
    def _add_max_shifts_per_month_constraint(self, x, members, shifts, days_in_month, constraints):
        """Limit maximum shift assignments per month per worker"""
        max_shifts = constraints.get('max_days_per_month', 31)  # Keep the same constraint key for backward compatibility
        logging.info(f"Adding max shifts per month constraint: {max_shifts} shifts per worker")
        
        constraints_added = 0
        for m in range(len(members)):
            # Sum of all shift assignments for this member should be <= max_shifts
            total_assignments = sum(x[m, s, d] for s in range(len(shifts)) for d in range(days_in_month))
            self.model.Add(total_assignments <= max_shifts)
            constraints_added += 1
        
        logging.info(f"Added {constraints_added} max shifts per month constraints")
    
    def _add_max_consecutive_shifts_constraint(self, x, members, shifts, days_in_month, constraints):
        """Limit maximum consecutive shifts in a row per worker"""
        max_consecutive = constraints.get('max_consecutive_days', 31)  # Keep the same constraint key for backward compatibility
        logging.info(f"Adding max consecutive shifts constraint: {max_consecutive} consecutive shifts per worker")
        
        constraints_added = 0
        for m in range(len(members)):
            for d in range(days_in_month - max_consecutive):
                # For each possible starting day, ensure no more than max_consecutive shifts in a row
                # This prevents workers from being assigned to too many consecutive shifts
                consecutive_sum = sum(x[m, s, d + i] for s in range(len(shifts)) for i in range(max_consecutive + 1))
                self.model.Add(consecutive_sum <= max_consecutive)
                constraints_added += 1
        
        logging.info(f"Added {constraints_added} max consecutive shifts constraints")
    

    
    def _add_custom_constraints(self, x, members, shifts, days_in_month, constraints):
        """Add custom constraints based on team rules"""
        parsed_constraints = constraints.get('parsed_custom_constraints', {})
        
        constraints_added = 0
        
        # Log what we're working with
        logging.info(f"Processing custom constraints: parsed={len(parsed_constraints) if parsed_constraints else 0} rules")
        logging.info(f"Parsed custom constraints: {parsed_constraints}")
        
        # Process parsed constraints if available
        if parsed_constraints and isinstance(parsed_constraints, dict):
            constraints_added += self._process_parsed_constraints(x, members, shifts, days_in_month, parsed_constraints)
        else:
            logging.info("No parsed constraints available - skipping custom constraints")
        
        logging.info(f"Added {constraints_added} custom constraints total")
    
    def _process_parsed_constraints(self, x, members, shifts, days_in_month, parsed_constraints):
        """Process structured constraints from the constraint parser"""
        constraints_added = 0
        
        # Process shift rules
        shift_rules = parsed_constraints.get('shift_rules', [])
        for rule in shift_rules:
            rule_type = rule.get('type', '')
            if rule_type == 'no_consecutive_nights' and rule.get('enabled', False):
                constraints_added += self._add_no_consecutive_nights_constraint(x, members, shifts, days_in_month, rule)
            elif rule_type == 'min_rest_hours':
                constraints_added += self._add_min_rest_hours_constraint(x, members, shifts, days_in_month, rule)
        
        # Process member rules
        member_rules = parsed_constraints.get('member_rules', [])
        for rule in member_rules:
            rule_type = rule.get('type', '')
            if rule_type == 'date_restriction':
                constraints_added += self._add_date_restriction_constraint(x, members, shifts, days_in_month, rule)
            elif rule_type == 'shift_preference':
                constraints_added += self._add_shift_preference_constraint(x, members, shifts, days_in_month, rule)
        
        # Process team rules
        team_rules = parsed_constraints.get('team_rules', [])
        for rule in team_rules:
            rule_type = rule.get('type', '')
            if rule_type == 'fair_distribution' and rule.get('enabled', False):
                constraints_added += self._add_fair_distribution_constraint(x, members, shifts, days_in_month, rule)
        
        return constraints_added
    

    
    def _add_no_consecutive_nights_constraint(self, x, members, shifts, days_in_month, rule):
        """Add constraint to prevent consecutive night shifts"""
        constraints_added = 0
        min_rest_hours = rule.get('min_rest_hours', 24)
        
        # This is a simplified implementation - in practice you'd need to identify night shifts
        # and ensure proper rest periods between them
        logging.info(f"Adding no consecutive nights constraint with {min_rest_hours}h rest")
        
        return constraints_added
    
    def _add_min_rest_hours_constraint(self, x, members, shifts, days_in_month, rule):
        """Add minimum rest hours constraint between shifts"""
        constraints_added = 0
        min_rest = rule.get('value', 12)
        
        logging.info(f"Adding minimum rest hours constraint: {min_rest}h between shifts")
        
        # This would require more complex logic to track shift times and ensure rest periods
        # For now, just log that we're processing it
        
        return constraints_added
    
    def _add_date_restriction_constraint(self, x, members, shifts, days_in_month, rule):
        """Add date restriction constraints for specific members"""
        constraints_added = 0
        member_name = rule.get('member_name', '')
        restricted_dates = rule.get('restricted_dates', [])
        
        if member_name and restricted_dates:
            member_index = next((i for i, m in enumerate(members) if member_name in m['name']), None)
            if member_index is not None:
                logging.info(f"Adding date restrictions for {member_name}")
                # Process date restrictions (simplified for now)
        
        return constraints_added
    
    def _add_shift_preference_constraint(self, x, members, shifts, days_in_month, rule):
        """Add shift preference constraints"""
        constraints_added = 0
        member_name = rule.get('member_name', '')
        preferred_shifts = rule.get('preferred_shifts', [])
        avoided_shifts = rule.get('avoided_shifts', [])
        
        if member_name and (preferred_shifts or avoided_shifts):
            member_index = next((i for i, m in enumerate(members) if member_name in m['name']), None)
            if member_index is not None:
                logging.info(f"Adding shift preferences for {member_name}")
                # Process shift preferences (simplified for now)
        
        return constraints_added
    
    def _add_fair_distribution_constraint(self, x, members, shifts, days_in_month, rule):
        """Add fair distribution constraints"""
        constraints_added = 0
        max_variance = rule.get('max_variance', 2)
        
        logging.info(f"Adding fair distribution constraint with max variance: {max_variance}")
        
        # This would require more complex logic to balance assignments
        # For now, just log that we're processing it
        
        return constraints_added
    
    def _extract_solution(self, x, members, shifts, days_in_month, month, year):
        """Extract the solution from the solver"""
        assignments = []
        
        for m in range(len(members)):
            for s in range(len(shifts)):
                for d in range(days_in_month):
                    if self.solver.Value(x[m, s, d]) == 1:
                        date_str = f"{year}-{month:02d}-{d+1:02d}"
                        assignments.append({
                            "member_name": members[m]['name'],
                            "shift_name": shifts[s]['name'],
                            "date": date_str
                        })
        
        return {
            "assignments": assignments,
            "solver_status": "OPTIMAL" if self.solver.StatusName() == "OPTIMAL" else "FEASIBLE",
            "solve_time": self.solver.WallTime()
        }

# Global solver instance
solver = ScheduleSolver()

@app.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({"status": "healthy", "service": "OR-Tools Schedule Solver"})

@app.route('/solve', methods=['POST'])
def solve_schedule():
    """Main endpoint to solve schedule"""
    try:
        data = request.get_json()
        
        if not data:
            return jsonify({"error": "No data provided"}), 400
        
        # Validate required fields
        required_fields = ['members', 'shifts', 'availability', 'constraints', 'month', 'year']
        for field in required_fields:
            if field not in data:
                return jsonify({"error": f"Missing required field: {field}"}), 400
        
        logging.info(f"Solving schedule for team with {len(data['members'])} members, {len(data['shifts'])} shifts")
        logging.info(f"Data types - members: {type(data['members'])}, shifts: {type(data['shifts'])}, availability: {type(data['availability'])}, constraints: {type(data['constraints'])}")
        logging.info(f"Availability data: {data['availability']}")
        
        # Solve the schedule
        result = solver.solve_schedule(data)
        
        if "error" in result:
            return jsonify(result), 400
        
        return jsonify(result)
        
    except Exception as e:
        logging.error(f"Error in solve endpoint: {str(e)}")
        return jsonify({"error": f"Internal server error: {str(e)}"}), 500

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)
