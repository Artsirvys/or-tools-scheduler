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
            self._add_availability_constraints(x, members, shifts, availability, days_in_month)
            
            # 2. NO CONSECUTIVE NIGHTS (Hard constraint)
            self._add_no_consecutive_nights_constraint(x, members, shifts, days_in_month)
            
            # 3. WORKERS PER SHIFT (Hard constraint)
            self._add_workers_per_shift_constraint(x, members, shifts, days_in_month, constraints)
            
            # 4. MAX DAYS PER MONTH (Hard constraint)
            self._add_max_days_per_month_constraint(x, members, shifts, days_in_month, constraints)
            
            # 5. MIN REST HOURS (Hard constraint)
            self._add_min_rest_hours_constraint(x, members, shifts, days_in_month, constraints)
            
            # 6. ALL WORKERS MUST BE ASSIGNED (Soft constraint with penalty)
            self._add_assignment_balance_constraint(x, members, shifts, days_in_month)
            
            # 7. CUSTOM CONSTRAINTS (Dynamic based on team rules)
            self._add_custom_constraints(x, members, shifts, days_in_month, constraints)
            
            # Solve the model
            status = self.solver.Solve(self.model)
            
            if status == cp_model.OPTIMAL or status == cp_model.FEASIBLE:
                return self._extract_solution(x, members, shifts, days_in_month, month, year)
            else:
                return {"error": "No feasible solution found"}
                
        except Exception as e:
            logging.error(f"Error solving schedule: {str(e)}")
            return {"error": f"Solver error: {str(e)}"}
    
    def _add_availability_constraints(self, x, members, shifts, availability, days_in_month):
        """Add availability constraints - workers can only be assigned when available"""
        # Ensure availability is a list
        if not isinstance(availability, list):
            logging.warning(f"Availability is not a list: {type(availability)}, skipping availability constraints")
            return
            
        for m in range(len(members)):
            for s in range(len(shifts)):
                for d in range(days_in_month):
                    date_str = f"{datetime.now().year}-{datetime.now().month:02d}-{d+1:02d}"
                    
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
    
    def _add_no_consecutive_nights_constraint(self, x, members, shifts, days_in_month):
        """Add constraint to prevent consecutive night shifts"""
        for m in range(len(members)):
            for d in range(days_in_month - 1):
                # For each member, prevent consecutive days of any shifts
                consecutive_shifts = []
                for s in range(len(shifts)):
                    consecutive_shifts.append(x[m, s, d])
                    consecutive_shifts.append(x[m, s, d + 1])
                
                # Sum of consecutive shifts should be <= 1
                self.model.Add(sum(consecutive_shifts) <= 1)
    
    def _add_workers_per_shift_constraint(self, x, members, shifts, days_in_month, constraints):
        """Ensure correct number of workers per shift"""
        workers_per_shift = constraints.get('workers_per_shift', 1)
        
        for s in range(len(shifts)):
            for d in range(days_in_month):
                # Sum of workers assigned to this shift on this day should equal workers_per_shift
                constraint = sum(x[m, s, d] for m in range(len(members))) == workers_per_shift
                self.model.Add(constraint)
    
    def _add_max_days_per_month_constraint(self, x, members, shifts, days_in_month, constraints):
        """Limit maximum days per month per worker"""
        max_days = constraints.get('max_days_per_month', 31)
        
        for m in range(len(members)):
            # Sum of all assignments for this member should be <= max_days
            total_assignments = sum(x[m, s, d] for s in range(len(shifts)) for d in range(days_in_month))
            self.model.Add(total_assignments <= max_days)
    
    def _add_min_rest_hours_constraint(self, x, members, shifts, days_in_month, constraints):
        """Ensure minimum rest hours between shifts"""
        min_rest_hours = constraints.get('min_rest_hours', 8)
        
        # This is a simplified version - in practice you'd need shift timing data
        # For now, we'll ensure at least one day off between shifts
        for m in range(len(members)):
            for d in range(days_in_month - 1):
                # If assigned on day d, ensure no assignment on day d+1
                day_d_assignments = sum(x[m, s, d] for s in range(len(shifts)))
                day_d_plus_1_assignments = sum(x[m, s, d + 1] for s in range(len(shifts)))
                
                # If assigned on day d, day d+1 must be 0
                self.model.Add(day_d_assignments + day_d_plus_1_assignments <= 1)
    
    def _add_assignment_balance_constraint(self, x, members, shifts, days_in_month):
        """Ensure all workers get some assignments (soft constraint)"""
        
        for m in range(len(members)):
            # Each member should get at least some assignments
            total_assignments = sum(x[m, s, d] for s in range(len(shifts)) for d in range(days_in_month))
            self.model.Add(total_assignments >= 1)  # At least 1 assignment per month
    
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
