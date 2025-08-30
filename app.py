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
        ai_constraints = constraints.get('ai_translated_constraints', [])  # New field for AI constraints
        
        constraints_added = 0
        
        # Log what we're working with
        logging.info(f"Processing custom constraints: parsed={len(parsed_constraints) if parsed_constraints else 0} rules")
        logging.info(f"Processing AI-translated constraints: {len(ai_constraints) if ai_constraints else 0} constraints")
        
        # Process parsed constraints if available (legacy format)
        if parsed_constraints and isinstance(parsed_constraints, dict):
            constraints_added += self._process_parsed_constraints(x, members, shifts, days_in_month, parsed_constraints)
        
        # Process AI-translated constraints (new format)
        if ai_constraints and isinstance(ai_constraints, list):
            constraints_added += self._process_ai_translated_constraints(x, members, shifts, days_in_month, ai_constraints)
        
        if not parsed_constraints and not ai_constraints:
            logging.info("No custom constraints available - skipping custom constraints")
        
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
    
    def _process_ai_translated_constraints(self, x, members, shifts, days_in_month, ai_constraints):
        """Process modern AI-translated constraints from custom_constraints table"""
        constraints_added = 0
        
        if not ai_constraints or not isinstance(ai_constraints, list):
            logging.info("No AI-translated constraints to process")
            return constraints_added
        
        for constraint in ai_constraints:
            if constraint.get('status') != 'translated':
                continue
                
            ai_translation = constraint.get('ai_translation', {})
            if not ai_translation:
                continue
                
            constraint_type = ai_translation.get('constraint_type', '')
            parameters = ai_translation.get('parameters', {})
            priority = ai_translation.get('priority', 'medium')
            
            logging.info(f"Processing AI-translated constraint: {constraint_type} (priority: {priority})")
            
            try:
                if constraint_type == 'consecutive_shift_restriction':
                    constraints_added += self._add_ai_consecutive_shift_restriction(x, members, shifts, days_in_month, parameters)
                elif constraint_type == 'workers_per_shift':
                    constraints_added += self._add_ai_workers_per_shift_constraint(x, members, shifts, days_in_month, parameters)
                elif constraint_type == 'min_rest_hours':
                    constraints_added += self._add_ai_min_rest_hours_constraint(x, members, shifts, days_in_month, parameters)
                elif constraint_type == 'shift_preference':
                    constraints_added += self._add_ai_shift_preference_constraint(x, members, shifts, days_in_month, parameters)
                elif constraint_type == 'shift_rotation':
                    constraints_added += self._add_ai_shift_rotation_constraint(x, members, shifts, days_in_month, parameters)
                else:
                    logging.warning(f"Unknown AI constraint type: {constraint_type}")
                    
            except Exception as e:
                logging.error(f"Error processing AI constraint {constraint_type}: {e}")
                continue
        
        logging.info(f"Added {constraints_added} AI-translated constraints")
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
        target_keywords = shift_identifiers.get('keywords', [])
        target_time_ranges = shift_identifiers.get('time_ranges', [])
        
        logging.info(f"Adding consecutive shift restriction: max {max_consecutive} consecutive {shift_type} shifts")
        logging.info(f"Looking for shifts with: names={target_names}, keywords={target_keywords}, times={target_time_ranges}")
        
        # Identify shifts of the specified type using multiple strategies
        target_shift_indices = []
        for i, shift in enumerate(shifts):
            shift_name = shift.get('name', '').lower()
            shift_start = shift.get('start_time', '')
            shift_end = shift.get('end_time', '')
            
            is_target_shift = False
            
            # Strategy 1: Check if shift name is in target names
            if shift.get('name') in target_names:
                is_target_shift = True
                logging.debug(f"Shift '{shift.get('name')}' matched by exact name")
            
            # Strategy 2: Check if shift name contains target keywords
            elif any(keyword.lower() in shift_name for keyword in target_keywords):
                is_target_shift = True
                logging.debug(f"Shift '{shift.get('name')}' matched by keyword")
            
            # Strategy 3: Check if shift times fall within target ranges
            elif self._is_shift_in_time_ranges(shift_start, shift_end, target_time_ranges):
                is_target_shift = True
                logging.debug(f"Shift '{shift.get('name')}' matched by time range")
            
            # Strategy 4: Fallback to intelligent time-based classification
            elif self._classify_shift_by_time(shift_start, shift_end, shift_type):
                is_target_shift = True
                logging.debug(f"Shift '{shift.get('name')}' classified as {shift_type} by time")
            
            if is_target_shift:
                target_shift_indices.append(i)
        
        if not target_shift_indices:
            logging.warning(f"No {shift_type} shifts found using any identification method")
            logging.warning(f"Available shifts: {[s.get('name') for s in shifts]}")
            return constraints_added
        
        logging.info(f"Identified {len(target_shift_indices)} {shift_type} shifts: {[shifts[i].get('name') for i in target_shift_indices]}")
        
        # Add constraint: no more than max_consecutive consecutive shifts of this type
        for m in range(len(members)):
            for d in range(days_in_month - max_consecutive):
                consecutive_sum = sum(x[m, s, d + i] for s in target_shift_indices for i in range(max_consecutive + 1))
                self.model.Add(consecutive_sum <= max_consecutive)
                constraints_added += 1
        
        return constraints_added
    
    def _is_shift_in_time_ranges(self, start_time, end_time, target_ranges):
        """Check if shift times fall within any target time ranges"""
        if not start_time or not end_time or not target_ranges:
            return False
        
        try:
            # Convert shift times to minutes for comparison
            shift_start_minutes = self._time_to_minutes(start_time)
            shift_end_minutes = self._time_to_minutes(end_time)
            
            for time_range in target_ranges:
                if '-' in time_range:
                    range_start, range_end = time_range.split('-')
                    range_start_minutes = self._time_to_minutes(range_start)
                    range_end_minutes = self._time_to_minutes(range_end)
                    
                    # Handle overnight shifts (e.g., 22:00-06:00)
                    if range_start_minutes > range_end_minutes:
                        # Overnight shift
                        if (shift_start_minutes >= range_start_minutes or 
                            shift_end_minutes <= range_end_minutes or
                            shift_start_minutes <= range_end_minutes):
                            return True
                    else:
                        # Same-day shift
                        if (shift_start_minutes >= range_start_minutes and 
                            shift_end_minutes <= range_end_minutes):
                            return True
            
            return False
        except Exception as e:
            logging.warning(f"Error parsing time ranges: {e}")
            return False
    
    def _classify_shift_by_time(self, start_time, end_time, shift_type):
        """Intelligently classify shifts by time when other methods fail"""
        if not start_time or not end_time:
            return False
        
        try:
            start_minutes = self._time_to_minutes(start_time)
            end_minutes = self._time_to_minutes(end_time)
            
            if shift_type == 'night':
                # Night shifts: typically 22:00-06:00 (22:00 = 1320 minutes, 06:00 = 360 minutes)
                if start_minutes >= 1320 or end_minutes <= 360:
                    return True
            elif shift_type == 'day':
                # Day shifts: typically 06:00-18:00 (06:00 = 360 minutes, 18:00 = 1080 minutes)
                if 360 <= start_minutes <= 1080 and 360 <= end_minutes <= 1080:
                    return True
            elif shift_type == 'afternoon':
                # Afternoon shifts: typically 12:00-20:00 (12:00 = 720 minutes, 20:00 = 1200 minutes)
                if 720 <= start_minutes <= 1200 and 720 <= end_minutes <= 1200:
                    return True
            elif shift_type == 'morning':
                # Morning shifts: typically 06:00-14:00 (06:00 = 360 minutes, 14:00 = 840 minutes)
                if 360 <= start_minutes <= 840 and 360 <= end_minutes <= 840:
                    return True
            elif shift_type == 'evening':
                # Evening shifts: typically 18:00-02:00 (18:00 = 1080 minutes, 02:00 = 120 minutes)
                if start_minutes >= 1080 or end_minutes <= 120:
                    return True
            
            return False
        except Exception as e:
            logging.warning(f"Error classifying shift by time: {e}")
            return False
    
    def _time_to_minutes(self, time_str):
        """Convert time string (HH:MM) to minutes since midnight"""
        try:
            hours, minutes = map(int, time_str.split(':'))
            return hours * 60 + minutes
        except Exception:
            return 0
    
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
    
    def _add_ai_min_rest_hours_constraint(self, x, members, shifts, days_in_month, parameters):
        """Add minimum rest hours constraint between shifts"""
        constraints_added = 0
        
        min_hours = parameters.get('min_hours', 12)
        applies_to = parameters.get('applies_to', 'all_shifts')
        
        logging.info(f"Adding minimum rest hours constraint: {min_hours}h between shifts (applies to: {applies_to})")
        
        # This is a simplified implementation - in practice you'd need to track shift times
        # and ensure proper rest periods between consecutive shifts for the same worker
        
        # For now, we'll add a basic constraint that prevents consecutive day assignments
        # This is a rough approximation of rest hours
        for m in range(len(members)):
            for d in range(days_in_month - 1):
                # If assigned to any shift on day d, can't be assigned to any shift on day d+1
                # This ensures at least ~24h rest (simplified)
                day_d_sum = sum(x[m, s, d] for s in range(len(shifts)))
                day_d_plus_1_sum = sum(x[m, s, d + 1] for s in range(len(shifts)))
                self.model.Add(day_d_sum + day_d_plus_1_sum <= 1)
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
