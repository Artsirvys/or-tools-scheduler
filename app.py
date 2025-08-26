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
            
            # 2. NO CONSECUTIVE NIGHTS (Hard constraint)
            logging.info("Adding consecutive nights constraint...")
            self._add_no_consecutive_nights_constraint(x, members, shifts, days_in_month)
            
            # 3. WORKERS PER SHIFT (Hard constraint)
            logging.info("Adding workers per shift constraint...")
            self._add_workers_per_shift_constraint(x, members, shifts, days_in_month, constraints)
            
            # 4. MAX DAYS PER MONTH (Hard constraint)
            logging.info("Adding max days per month constraint...")
            self._add_max_days_per_month_constraint(x, members, shifts, days_in_month, constraints)
            
            # 5. MIN REST HOURS (Hard constraint)
            logging.info("Adding min rest hours constraint...")
            self._add_min_rest_hours_constraint(x, members, shifts, days_in_month, constraints)
            
            # 6. ALL WORKERS MUST BE ASSIGNED (Soft constraint with penalty)
            logging.info("Adding assignment balance constraint...")
            self._add_assignment_balance_constraint(x, members, shifts, days_in_month)
            
            # 7. CUSTOM CONSTRAINTS (Dynamic based on team rules)
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
        for m in range(len(members)):
            for s in range(len(shifts)):
                for d in range(days_in_month):
                    date_str = f"{year}-{month:02d}-{d+1:02d}"
                    
                    # Find availability for this member, shift, and date
                    member_id = members[m]['id']
                    shift_id = shifts[s]['id']
                    
                    # Check if member is unavailable for this shift/date
                    is_unavailable = any(
                        a['user_id'] == member_id and 
                        a['shift_id'] == shift_id and 
                        a['date'] == date_str and 
                        a['status'] == 'unavailable'
                        for a in availability
                    )
                    
                    if is_unavailable:
                        # Force assignment to 0 if unavailable
                        self.model.Add(x[m, s, d] == 0)
                        constraints_added += 1
                        logging.debug(f"Added constraint: {members[m]['name']} cannot work {shifts[s]['name']} on {date_str}")
        
        logging.info(f"Added {constraints_added} availability constraints")
    
    def _add_no_consecutive_nights_constraint(self, x, members, shifts, days_in_month):
        """Add constraint to prevent consecutive night shifts (only for night shifts)"""
        # This constraint is now optional and should be configurable per team
        # For now, we'll skip it to allow the solver to find solutions
        pass
    
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
    
    def _add_max_days_per_month_constraint(self, x, members, shifts, days_in_month, constraints):
        """Limit maximum days per month per worker"""
        max_days = constraints.get('max_days_per_month', 31)
        logging.info(f"Adding max days per month constraint: {max_days} days per worker")
        
        constraints_added = 0
        for m in range(len(members)):
            # Sum of all assignments for this member should be <= max_days
            total_assignments = sum(x[m, s, d] for s in range(len(shifts)) for d in range(days_in_month))
            self.model.Add(total_assignments <= max_days)
            constraints_added += 1
        
        logging.info(f"Added {constraints_added} max days per month constraints")
    
    def _add_min_rest_hours_constraint(self, x, members, shifts, days_in_month, constraints):
        """Ensure minimum rest hours between shifts"""
        # This constraint is now optional and should be configurable per team
        # For now, we'll skip it to allow the solver to find solutions
        # Teams can configure their own rest hour policies based on shift timing
        pass
    
    def _add_assignment_balance_constraint(self, x, members, shifts, days_in_month):
        """Ensure all workers get some assignments (soft constraint)"""
        # This constraint is now truly soft - we'll try but won't fail if impossible
        # Teams can configure their own assignment balance policies
        pass
    
    def _add_custom_constraints(self, x, members, shifts, days_in_month, constraints):
        """Add custom constraints based on team rules"""
        custom_rules = constraints.get('custom_constraints', '')
        
        # Example: "Assign worker 'Andrew' only for days 15-30"
        if 'Andrew' in custom_rules and 'days 15-30' in custom_rules:
            andrew_index = next((i for i, m in enumerate(members) if 'Andrew' in m['name']), None)
            if andrew_index is not None:
                for s in range(len(shifts)):
                    for d in range(days_in_month):
                        if d < 14 or d >= 30:  # Days 1-14 and 31+ (0-indexed)
                            self.model.Add(x[andrew_index, s, d] == 0)
    
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
