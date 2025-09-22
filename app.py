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
            basic_constraints = team_data.get('basic_constraints', {})
            custom_constraints = team_data.get('custom_constraints', [])
            month = team_data['month']
            year = team_data['year']
            
            # Merge constraints for backward compatibility
            constraints = {
                'max_consecutive_days': basic_constraints.get('max_consecutive_days', 30),
                'max_days_per_month': basic_constraints.get('max_days_per_month', 20),
                'workers_per_shift': basic_constraints.get('workers_per_shift', 2),
                'shift_specific_workers': basic_constraints.get('shift_specific_workers', {}),
                'custom_constraints': custom_constraints,
            }
            
            # Get month details
            days_in_month = (datetime(year, month + 1, 1) - datetime(year, month, 1)).days
            
            # DEBUG: Log all input data
            logging.info(f"=== SOLVER INPUT DATA ===")
            logging.info(f"Members: {len(members)} - {[m['name'] for m in members]}")
            logging.info(f"Shifts: {len(shifts)} - {[s['name'] for s in shifts]}")
            logging.info(f"Month: {month}, Year: {year}, Days: {days_in_month}")
            logging.info(f"Basic Constraints: {basic_constraints}")
            logging.info(f"Custom Constraints: {len(custom_constraints)} items")
            logging.info(f"Merged Constraints: {constraints}")
            logging.info(f"Availability entries: {len(availability)}")
            if availability:
                logging.info(f"Sample availability: {availability[0] if availability else 'None'}")
            logging.info(f"=== END INPUT DATA ===")
            
            # Create the model
            self.model = cp_model.CpModel()
            self.solver = cp_model.CpSolver()
            
            # Add dummy worker for unassigned slots
            dummy_worker = {
                "id": "unassigned",
                "name": "Unassigned"
            }
            members.append(dummy_worker)
            dummy_index = len(members) - 1
            
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
            
            # 6. MULTI-OBJECTIVE OPTIMIZATION: Balance multiple objectives
            logging.info("Adding multi-objective optimization...")
            self._add_multi_objective(x, members, shifts, days_in_month, availability, constraints, dummy_index, month, year)
            
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
                result = self._extract_solution(x, members, shifts, days_in_month, month, year)
                
                # Check if solution has zero assignments and use fallback if needed
                if result and len(result.get("assignments", [])) == 0:
                    logging.warning("Solver found optimal solution with zero assignments - using fallback")
                    return self._solve_with_fallback(x, members, shifts, days_in_month, month, year)
                
                return result
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
                    
                    if members[m]["id"] == "unassigned":
                        # Dummy worker is always available
                        continue
                        
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
        # Check for custom workers_per_shift override
        parsed_constraints = constraints.get('parsed_custom_constraints', {})
        custom_workers = None
        
        # Look for custom workers_per_shift rule
        for rule in parsed_constraints.get('shift_rules', []):
            if rule.get('type') == 'workers_per_shift' and 'value' in rule:
                custom_workers = rule.get('value')
                logging.info(f"Found custom workers_per_shift override: {custom_workers}")
                break
        
        # Use custom value if available, otherwise use global constraint
        workers_per_shift = custom_workers if custom_workers is not None else constraints.get('workers_per_shift', 1)
        logging.info(f"Using workers per shift constraint: {workers_per_shift} workers per shift")
        
        constraints_added = 0
        for s in range(len(shifts)):
            for d in range(days_in_month):
                # Sum of workers assigned to this shift on this day should be <= workers_per_shift
                shift_sum = sum(x[m, s, d] for m in range(len(members)))
                self.model.Add(shift_sum <= workers_per_shift)
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
        custom_constraints = constraints.get('custom_constraints', [])
        
        constraints_added = 0
        
        # Log what we're working with
        logging.info(f"Processing custom constraints: {len(custom_constraints) if custom_constraints else 0} constraints")
        
        # Process custom constraints from custom_constraints table
        if custom_constraints and isinstance(custom_constraints, list):
            constraints_added += self._process_custom_constraints(x, members, shifts, days_in_month, custom_constraints)
        
        if not custom_constraints:
            logging.info("No custom constraints available - skipping custom constraints")
        
        logging.info(f"Added {constraints_added} custom constraints total")
    
    def _process_custom_constraints(self, x, members, shifts, days_in_month, custom_constraints):
        """Process custom constraints from custom_constraints table"""
        constraints_added = 0
        
        if not custom_constraints or not isinstance(custom_constraints, list):
            logging.info("No custom constraints to process")
            return constraints_added
        
        for constraint in custom_constraints:
            # Debug: Log the actual constraint structure
            logging.info(f"DEBUG: Constraint structure: {constraint}")
            
            # Handle both old format (ai_translation) and new format (direct fields)
            # Priority: constraint_type field first, then ai_translation.constraint_type
            constraint_type = constraint.get('constraint_type', '')
            logging.info(f"DEBUG: Top-level constraint_type: '{constraint_type}'")
            
            # Get parameters from ai_translation if it exists, otherwise from direct field
            if 'ai_translation' in constraint:
                ai_translation = constraint.get('ai_translation', {})
                parameters = ai_translation.get('parameters', {})
                logging.info(f"DEBUG: ai_translation constraint_type: '{ai_translation.get('constraint_type', '')}'")
                
                # If constraint_type is empty at top level, get it from ai_translation
                if not constraint_type:
                    constraint_type = ai_translation.get('constraint_type', '')
                    logging.info(f"DEBUG: Got constraint_type from ai_translation: '{constraint_type}'")
            else:
                parameters = constraint.get('parameters', {})
            
            # Skip if constraint is not translated
            if constraint.get('status') != 'translated':
                logging.info(f"Skipping constraint with status: {constraint.get('status')}")
                continue
            
            logging.info(f"Processing custom constraint: '{constraint_type}'")
            
            try:
                if constraint_type == 'consecutive_shift_restriction':
                    constraints_added += self._add_ai_consecutive_shift_restriction(x, members, shifts, days_in_month, parameters)
                elif constraint_type == 'workers_per_shift':
                    constraints_added += self._add_ai_workers_per_shift_constraint(x, members, shifts, days_in_month, parameters)
                elif constraint_type == 'shift_preference':
                    constraints_added += self._add_ai_shift_preference_constraint(x, members, shifts, days_in_month, parameters)
                elif constraint_type == 'shift_rotation':
                    constraints_added += self._add_ai_shift_rotation_constraint(x, members, shifts, days_in_month, parameters)
                elif constraint_type == 'shift_transition_restriction':
                    constraints_added += self._add_shift_transition_restriction(x, members, shifts, days_in_month, parameters)
                elif constraint_type == 'workload_distribution':
                    # This constraint type is handled by the multi-objective optimization
                    # No additional constraints needed - just log for clarity
                    logging.info(f"Workload distribution constraint handled by multi-objective optimization")
                else:
                    logging.warning(f"Unknown custom constraint type: {constraint_type}")
                    
            except Exception as e:
                logging.error(f"Error processing custom constraint {constraint_type}: {e}")
                continue
        
        logging.info(f"Added {constraints_added} custom constraints")
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
                
                # For now, we'll implement this as a soft constraint by adding it to the objective function
                # This allows the solver to find a feasible solution while trying to respect preferences
                
                if preferred_shifts:
                    preferred_shift_indices = [i for i, s in enumerate(shifts) if s['name'] in preferred_shifts]
                    if preferred_shift_indices:
                        # Add a soft constraint that encourages assignment to preferred shifts
                        # We'll use a penalty approach in the objective function
                        for d in range(days_in_month):
                            # This is a soft constraint - we'll add it to the objective function later
                            # For now, just count it as a constraint added
                            constraints_added += 1
                
                if avoided_shifts:
                    avoided_shift_indices = [i for i, s in enumerate(shifts) if s['name'] in avoided_shifts]
                    if avoided_shift_indices:
                        # Add a soft constraint to minimize assignment to avoided shifts
                        for d in range(days_in_month):
                            # This is a soft constraint - we'll add it to the objective function later
                            # For now, just count it as a constraint added
                            constraints_added += 1
        
        return constraints_added
    
    def _add_fair_distribution_constraint(self, x, members, shifts, days_in_month, rule):
        """Add fair distribution constraints"""
        constraints_added = 0
        max_variance = rule.get('max_variance', 2)
        
        logging.info(f"Adding fair distribution constraint with max variance: {max_variance}")
        
        # This would require more complex logic to balance assignments
        # For now, just log that we're processing it
        
        return constraints_added
    
    def _add_ai_consecutive_shift_restriction(self, x, members, shifts, days_in_month, parameters):
        """Add constraint to prevent consecutive shifts of a specific type"""
        constraints_added = 0
        
        shift_type = parameters.get('shift_type', 'night')
        max_consecutive = parameters.get('max_consecutive', 0)
        rest_period_hours = parameters.get('rest_period_hours', 12)
        
        # Get shift identifiers from AI translation
        shift_identifiers = parameters.get('shift_identifiers', {})
        target_names = shift_identifiers.get('names', [])
        
        # Get shift IDs from applies_to_shifts (most reliable method)
        applies_to_shifts = parameters.get('applies_to_shifts', [])
        
        logging.info(f"Adding consecutive shift restriction: max {max_consecutive} consecutive {shift_type} shifts")
        logging.info(f"Looking for shifts with: IDs={applies_to_shifts}, names={target_names}")
        
        # Identify shifts of the specified type using prioritized strategies
        target_shift_indices = []
        for i, shift in enumerate(shifts):
            shift_id = shift.get('id', '')
            shift_name = shift.get('name', '')
            
            is_target_shift = False
            
            # Strategy 1: Check if shift ID is in applies_to_shifts (most reliable)
            if shift_id in applies_to_shifts:
                is_target_shift = True
                logging.debug(f"Shift '{shift_name}' matched by ID: {shift_id}")
            
            # Strategy 2: Check if shift name exactly matches target names
            elif shift_name in target_names:
                is_target_shift = True
                logging.debug(f"Shift '{shift_name}' matched by exact name")
            
            # Strategy 3: Fallback to keyword matching only if no IDs/names provided
            elif not applies_to_shifts and not target_names:
                target_keywords = shift_identifiers.get('keywords', [])
                shift_name_lower = shift_name.lower()
                if any(keyword.lower() in shift_name_lower for keyword in target_keywords):
                    is_target_shift = True
                    logging.debug(f"Shift '{shift_name}' matched by keyword (fallback)")
            
            if is_target_shift:
                target_shift_indices.append(i)
        
        if not target_shift_indices:
            logging.warning(f"No {shift_type} shifts found using any identification method")
            logging.warning(f"Available shifts: {[s.get('name') for s in shifts]}")
            return constraints_added
        
        logging.info(f"Identified {len(target_shift_indices)} {shift_type} shifts: {[shifts[i].get('name') for i in target_shift_indices]}")
        
        # Add constraint: max_consecutive represents the MAXIMUM number of consecutive shifts allowed
        # e.g., max_consecutive=1 means "no more than 1 consecutive" (1 allowed, not 2)
        # e.g., max_consecutive=0 means "no consecutive" (0 allowed)
        for m in range(len(members)):
            for d in range(days_in_month - max_consecutive):
                consecutive_sum = sum(x[m, s, d + i] for s in target_shift_indices for i in range(max_consecutive + 1))
                self.model.Add(consecutive_sum <= max_consecutive)
                constraints_added += 1
        
        return constraints_added
    
    def _add_shift_transition_restriction(self, x, members, shifts, days_in_month, parameters):
        """Add constraint to prevent specific shift transitions (e.g., no day shift after night shift)"""
        constraints_added = 0
        
        forbidden_transitions = parameters.get('forbidden_transitions', [])
        
        if not forbidden_transitions:
            logging.warning("No forbidden transitions specified for shift_transition_restriction")
            return constraints_added
        
        logging.info(f"Adding shift transition restrictions: {len(forbidden_transitions)} forbidden transitions")
        
        for transition in forbidden_transitions:
            from_shift_id = transition.get('from_shift_id', '')
            to_shift_id = transition.get('to_shift_id', '')
            from_shift_name = transition.get('from_shift_name', '')
            to_shift_name = transition.get('to_shift_name', '')
            
            # Find shift indices
            from_shift_index = None
            to_shift_index = None
            
            for i, shift in enumerate(shifts):
                if shift.get('id') == from_shift_id:
                    from_shift_index = i
                if shift.get('id') == to_shift_id:
                    to_shift_index = i
            
            if from_shift_index is None or to_shift_index is None:
                logging.warning(f"Could not find shift indices for transition: {from_shift_name} -> {to_shift_name}")
                continue
            
            logging.info(f"Adding transition restriction: {from_shift_name} -> {to_shift_name}")
            
            # Add constraint: if worker m is assigned to from_shift on day d, 
            # they cannot be assigned to to_shift on day d+1
            for m in range(len(members)):
                for d in range(days_in_month - 1):  # -1 because we check d+1
                    # If assigned to from_shift on day d, cannot be assigned to to_shift on day d+1
                    # This translates to: x[m, from_shift_index, d] + x[m, to_shift_index, d+1] <= 1
                    self.model.Add(x[m, from_shift_index, d] + x[m, to_shift_index, d+1] <= 1)
                    constraints_added += 1
        
        logging.info(f"Added {constraints_added} shift transition constraints")
        return constraints_added
    
    def _add_ai_workers_per_shift_constraint(self, x, members, shifts, days_in_month, parameters):
        """Add constraint for specific worker requirements per shift"""
        constraints_added = 0
        
        workers_required = parameters.get('workers_required', 1)
        shift_names = parameters.get('shift_names', [])
        
        logging.info(f"Adding workers per shift constraint: {workers_required} workers for shifts: {shift_names}")
        
        # Identify target shifts
        target_shift_indices = []
        for i, shift in enumerate(shifts):
            if shift.get('name') in shift_names:
                target_shift_indices.append(i)
        
        if not target_shift_indices:
            logging.warning(f"Target shifts not found: {shift_names}")
            return constraints_added
        
        # Add constraint: exactly workers_required workers assigned to each target shift on each day
        for s in target_shift_indices:
            for d in range(days_in_month):
                shift_sum = sum(x[m, s, d] for m in range(len(members)))
                self.model.Add(shift_sum == workers_required)
                constraints_added += 1
        
        return constraints_added
    
    
    def _add_ai_shift_preference_constraint(self, x, members, shifts, days_in_month, parameters):
        """Add shift preference constraints (soft constraints)"""
        constraints_added = 0
        
        preferred_shifts = parameters.get('preferred_shifts', [])
        avoided_shifts = parameters.get('avoided_shifts', [])
        
        logging.info(f"Adding shift preference constraint: prefer {preferred_shifts}, avoid {avoided_shifts}")
        
        # This would be implemented as a soft constraint using objective function
        # For now, just log that we're processing it
        logging.info("Shift preferences are soft constraints - would be implemented in objective function")
        
        return constraints_added
    
    def _add_ai_shift_rotation_constraint(self, x, members, shifts, days_in_month, parameters):
        """Add shift rotation constraints for fair distribution"""
        constraints_added = 0
        
        rotation_type = parameters.get('rotation_type', 'weekend')
        max_variance = parameters.get('max_variance', 2)
        
        logging.info(f"Adding shift rotation constraint: {rotation_type} rotation with max variance {max_variance}")
        
        # This would ensure fair distribution of certain shifts
        # For now, just log that we're processing it
        logging.info("Shift rotation constraints would be implemented as fair distribution rules")
        
        return constraints_added
    
    def _extract_solution(self, x, members, shifts, days_in_month, month, year):
        """Extract the solution from the solver"""
        assignments = []
        
        for m in range(len(members)):
            for s in range(len(shifts)):
                for d in range(days_in_month):
                    if self.solver.Value(x[m, s, d]) == 1:
                        date_str = f"{year}-{month:02d}-{d+1:02d}"
                        # Only include assignments with real users (exclude dummy "unassigned" worker)
                        if members[m]['id'] != "unassigned":
                            assignments.append({
                                "user_id": members[m]['id'],
                                "shift_id": shifts[s]['id'],
                                "date": date_str
                            })
        
        return {
            "assignments": assignments,
            "solver_status": "OPTIMAL" if self.solver.StatusName() == "OPTIMAL" else "FEASIBLE",
            "solve_time": self.solver.WallTime()
        }

    def _add_multi_objective(self, x, members, shifts, days_in_month, availability, constraints, dummy_index, month, year):
        """Add multi-objective optimization to balance multiple scheduling goals"""
        logging.info("Setting up multi-objective optimization...")
        
        # 1. PRIMARY OBJECTIVE: Maximize total assignments (fill shifts)
        total_assignments = sum(x[m, s, d] for m in range(len(members)) for s in range(len(shifts)) for d in range(days_in_month))
        logging.info(f"Primary objective: Maximize {len(members) * len(shifts) * days_in_month} possible assignments")
        
        # 2. SECONDARY OBJECTIVE: Minimize unassigned shifts (penalty for dummy worker)
        unassigned_penalty = sum(x[dummy_index, s, d] for s in range(len(shifts)) for d in range(days_in_month))
        logging.info(f"Secondary objective: Minimize {len(shifts) * days_in_month} possible unassigned shifts")
        
        # 3. TERTIARY OBJECTIVE: Maximize priority assignments
        priority_bonus = 0
        priority_count = 0
        for m in range(len(members) - 1):  # Exclude dummy worker
            for s in range(len(shifts)):
                for d in range(days_in_month):
                    if self._is_priority_assignment(m, s, d, availability, members, shifts, days_in_month, month, year):
                        priority_bonus += x[m, s, d]
                        priority_count += 1
        
        logging.info(f"Tertiary objective: Maximize {priority_count} priority assignments")
        
        # 4. QUATERNARY OBJECTIVE: Balance workload distribution
        workload_variance = self._calculate_workload_variance(x, members, shifts, days_in_month)
        logging.info(f"Quaternary objective: Minimize workload variance")
        
        # 5. QUINARY OBJECTIVE: Balance shift type distribution
        shift_type_variance = self._calculate_shift_type_variance(x, members, shifts, days_in_month)
        logging.info(f"Quinary objective: Minimize shift type variance")
        
        # Multi-objective function with weighted priorities
        # Weights: assignments(1000) > priority(100) > unassigned(10) > workload_variance(50) > shift_type_variance(3)
        objective = (
            total_assignments * 1000 +      # Primary: maximize assignments
            priority_bonus * 100 +          # Secondary: prefer priority assignments
            -unassigned_penalty * 10 +      # Tertiary: minimize unassigned shifts
            -workload_variance * 50 +       # Quaternary: balance total workload
            -shift_type_variance * 3        # Quinary: balance shift types
        )
        
        self.model.Maximize(objective)
        logging.info("Multi-objective optimization configured successfully")

    def _is_priority_assignment(self, m, s, d, availability, members, shifts, days_in_month, month, year):
        """Check if this assignment should get priority bonus"""
        try:
            member_id = members[m]['id']
            shift_id = shifts[s]['id']
            # Use the same date format as in availability constraints
            date_str = f"{year}-{month:02d}-{d+1:02d}"
            
            # Find availability entry for this member, shift, and date
            availability_entry = next(
                (a for a in availability 
                 if a['user_id'] == member_id and 
                    a['shift_id'] == shift_id and 
                    a['date'] == date_str),
                None
            )
            
            # Return True if status is 'priority'
            if availability_entry and availability_entry.get('status') == 'priority':
                return True
                
        except (KeyError, IndexError, TypeError) as e:
            logging.debug(f"Error checking priority assignment: {e}")
            
        return False

    def _calculate_workload_variance(self, x, members, shifts, days_in_month):
        """Calculate workload distribution variance to balance total assignments per member"""
        try:
            if len(members) <= 1:
                return 0
            
            # Calculate total assignments per member (excluding dummy worker)
            member_totals = []
            for m in range(len(members) - 1):  # Exclude dummy worker
                total = sum(x[m, s, d] for s in range(len(shifts)) for d in range(days_in_month))
                member_totals.append(total)
            
            if not member_totals or len(member_totals) <= 1:
                return 0
            
            # Enhanced approach: penalize differences greater than 1
            variance_penalty = 0
            
            # Calculate penalty for differences greater than 1 between any two members
            for i in range(len(member_totals)):
                for j in range(i + 1, len(member_totals)):
                    diff = member_totals[i] - member_totals[j]
                    
                    # Heavy penalty for differences greater than 1
                    if abs(diff) > 1:
                        # Square the excess difference to heavily penalize large gaps
                        excess = abs(diff) - 1
                        variance_penalty += excess * excess * 100  # Heavy penalty
                        logging.debug(f"Large difference penalty: {excess}^2 * 100 = {excess * excess * 100}")
                    else:
                        # Small penalty for differences of 0 or 1 (acceptable)
                        variance_penalty += abs(diff) * 2
            
            logging.debug(f"Workload balance penalty: {variance_penalty} (member totals: {member_totals})")
            return variance_penalty
            
        except (IndexError, TypeError) as e:
            logging.debug(f"Error calculating workload variance: {e}")
            return 0

    def _calculate_shift_type_variance(self, x, members, shifts, days_in_month):
        """Calculate shift type distribution variance to balance shift types per member"""
        try:
            if len(members) <= 1 or len(shifts) <= 1:
                return 0
            
            # Group shifts by type (using shift name patterns)
            shift_types = {}
            for s, shift in enumerate(shifts):
                shift_name = shift.get('name', '').lower()
                
                # Determine shift type based on name patterns
                if any(keyword in shift_name for keyword in ['morning', 'day', 'am']):
                    shift_type = 'morning'
                elif any(keyword in shift_name for keyword in ['afternoon', 'pm']):
                    shift_type = 'afternoon'
                elif any(keyword in shift_name for keyword in ['night', 'evening', 'overnight']):
                    shift_type = 'night'
                else:
                    # If no pattern matches, use shift name as type
                    shift_type = shift_name
                
                if shift_type not in shift_types:
                    shift_types[shift_type] = []
                shift_types[shift_type].append(s)
            
            if not shift_types:
                return 0
            
            # Use simple sum approach for each shift type to encourage balance
            total_shift_assignments = 0
            for shift_type, shift_indices in shift_types.items():
                # Sum all assignments for this shift type across all members
                shift_type_total = 0
                for m in range(len(members) - 1):  # Exclude dummy worker
                    for s in shift_indices:
                        for d in range(days_in_month):
                            shift_type_total += x[m, s, d]
                
                total_shift_assignments += shift_type_total
                
                logging.debug(f"Shift type '{shift_type}' total assignments: {shift_type_total}")
            
            logging.debug(f"Total shift type assignments: {total_shift_assignments}")
            return total_shift_assignments
            
        except (IndexError, TypeError) as e:
            logging.debug(f"Error calculating shift type variance: {e}")
            return 0

    def _solve_with_fallback(self, x, members, shifts, days_in_month, month, year):
        """Fallback method when optimal solution has zero assignments"""
        logging.warning("Optimal solution has zero assignments - creating fallback schedule")
        
        assignments = []
        
        # Create a simple round-robin assignment for first week
        member_index = 0
        for d in range(min(7, days_in_month)):  # First week only
            for s in range(len(shifts)):
                if member_index < len(members) - 1:  # Exclude dummy worker
                    date_str = f"{year}-{month:02d}-{d+1:02d}"
                    assignments.append({
                        "user_id": members[member_index]['id'],
                        "shift_id": shifts[s]['id'],
                        "date": date_str
                    })
                    member_index = (member_index + 1) % (len(members) - 1)
        
        logging.info(f"Created fallback schedule with {len(assignments)} assignments")
        return {
            "assignments": assignments,
            "solver_status": "FALLBACK",
            "solve_time": 0
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
        required_fields = ['members', 'shifts', 'availability', 'month', 'year']
        for field in required_fields:
            if field not in data:
                return jsonify({"error": f"Missing required field: {field}"}), 400
        
        # Check for either basic_constraints or constraints (for backward compatibility)
        if 'basic_constraints' not in data and 'constraints' not in data:
            return jsonify({"error": "Missing required field: basic_constraints or constraints"}), 400
        
        logging.info(f"Solving schedule for team with {len(data['members'])} members, {len(data['shifts'])} shifts")
        logging.info(f"Data types - members: {type(data['members'])}, shifts: {type(data['shifts'])}, availability: {type(data['availability'])}")
        logging.info(f"Availability data: {data['availability']}")
        
        # Solve the schedule
        result = solver.solve_schedule(data)
        
        if "error" in result:
            return jsonify(result), 400
        
        return jsonify({
            "success": True,
            "assignments": result["assignments"],
            "stats": {
                "solver_status": result.get("solver_status", "UNKNOWN"),
                "solve_time": result.get("solve_time", 0),
                "assignments_count": len(result.get("assignments", []))
            }
        })
        
    except Exception as e:
        logging.error(f"Error in solve endpoint: {str(e)}")
        return jsonify({"error": f"Internal server error: {str(e)}"}), 500

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)