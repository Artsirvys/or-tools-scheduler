"use client";

import { useState, useEffect } from "react";
import { useRouter } from "@/i18n/routing";
import { useLocale } from 'next-intl';
import { createClient } from "@supabase/supabase-js";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle, Calendar, Eye, EyeOff, Check, X } from "lucide-react";
import Link from "next/link";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function SignUp() {
  const [showPassword, setShowPassword] = useState(false);
  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    email: "",
    password: "",
    confirmPassword: "",
    role: "",
    department: "",
  });
  const [isLoading, setIsLoading] = useState(false);
  const [accountType, setAccountType] = useState("host"); // Default to host for trial signups
  const [isInvitedUser, setIsInvitedUser] = useState(false);
  const [token, setToken] = useState("");
  const [selectedPlan, setSelectedPlan] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const router = useRouter();
  const locale = useLocale();

  useEffect(() => {
    // Check if this is an invitation link or plan selection
    const urlParams = new URLSearchParams(window.location.search);
    const tokenParam = urlParams.get("token");
    const planParam = urlParams.get("plan");
    
    if (tokenParam) {
      // Token-based invitation
      setIsInvitedUser(true);
      setToken(tokenParam);
      setAccountType("participant"); // Set account type to participant for invited users
      
      // Fetch invitation details to pre-fill email and other fields
      fetchInvitationDetails(tokenParam);
    } else if (planParam) {
      // Plan-based signup
      setSelectedPlan(planParam);
    }
  }, []);

  const fetchInvitationDetails = async (token: string) => {
    try {
      const response = await fetch(`/api/invite/validate?token=${token}`);
      if (response.ok) {
        const invitation = await response.json();
        setFormData(prev => ({ 
          ...prev, 
          email: invitation.email,
          role: invitation.role || "participant",
          department: invitation.department || ""
        }));
      }
    } catch (error) {
      console.error('Error fetching invitation details:', error);
    }
  };

  // Password validation
  const validatePassword = (password: string) => {
    const minLength = password.length >= 8;
    const hasNumber = /\d/.test(password);
    return {
      minLength,
      hasNumber,
      isValid: minLength && hasNumber,
    };
  };

  // Check if passwords match
  const passwordsMatch = formData.password === formData.confirmPassword;
  const passwordValidation = validatePassword(formData.password);

  const handleInputChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (formData.password !== formData.confirmPassword) {
      setError("Passwords don't match!");
      return;
    }

    setIsLoading(true);
    setError("");

    try {
      if (isInvitedUser && token) {
        // Token-based invitation - use the new API
        const res = await fetch("/api/signup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ 
            token, 
            email: formData.email, 
            password: formData.password, 
            name: `${formData.firstName} ${formData.lastName}`,
            role: formData.role,
            department: formData.department,
            accountType
          }),
        });

        const data = await res.json();
        if (res.ok) {
          setSuccess("Account created successfully! Redirecting to sign in...");
          setTimeout(() => {
            router.push(`/auth/signin?email=${encodeURIComponent(formData.email)}`);
          }, 2000);
        } else {
          setError(data.error || "Signup failed");
        }
      } else {
        // Regular signup
        // Build email redirect URL with plan parameter if selected
        // Note: Callback route is at /auth/callback, but middleware will redirect to /en/auth/callback
        // Using default locale for email links (user can switch language after signin)
        const callbackUrl = selectedPlan 
          ? `${window.location.origin}/${locale}/auth/callback?plan=${selectedPlan}`
          : `${window.location.origin}/${locale}/auth/callback`;

        const { data, error: signUpError } = await supabase.auth.signUp({
          email: formData.email,
          password: formData.password,
          options: {
            emailRedirectTo: callbackUrl,
            data: {
              first_name: formData.firstName,
              last_name: formData.lastName,
              account_type: accountType,
              title: formData.role || null,
              department: formData.department || null,
            }
          }
        });

        if (signUpError) {
          console.error('Sign up error:', signUpError);
          setError(signUpError.message);
          setIsLoading(false);
          return;
        }

        if (data.user) {
          // Always redirect to waiting for confirmation page first
          // Trial creation will happen after email confirmation
          setSuccess("Account created successfully! Please check your email to confirm your account.");
          setTimeout(() => {
            if (selectedPlan) {
              // Pass the plan info to the waiting page
              router.push(`/auth/waiting-for-confirmation?plan=${selectedPlan}&email=${encodeURIComponent(formData.email)}`);
            } else {
              router.push('/auth/waiting-for-confirmation');
            }
          }, 2000);
        }
      }
    } catch (error) {
      console.error('Unexpected error:', error);
      setError('An unexpected error occurred. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  if (isInvitedUser) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="flex items-center justify-center space-x-2 mb-4">
              <Calendar className="h-8 w-8 text-blue-600" />
              <span className="text-2xl font-bold">AISchedulator</span>
            </div>
            
            <CardTitle className="text-2xl">
              Welcome to the team!
            </CardTitle>
            <CardDescription>
              You have been invited to join the team. Complete your registration below.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="firstName">First Name</Label>
                  <Input
                    id="firstName"
                    placeholder="John"
                    value={formData.firstName}
                    onChange={(e) => handleInputChange("firstName", e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lastName">Last Name</Label>
                  <Input
                    id="lastName"
                    placeholder="Doe"
                    value={formData.lastName}
                    onChange={(e) => handleInputChange("lastName", e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="doctor@hospital.com"
                  value={formData.email}
                  onChange={(e) => handleInputChange("email", e.target.value)}
                  required
                  disabled={isInvitedUser} // Disable if this is an invited user
                  className={isInvitedUser ? "bg-gray-100 cursor-not-allowed" : ""}
                />
                {isInvitedUser && (
                  <p className="text-sm text-gray-500">
                    Email is pre-filled from your invitation
                  </p>
                )}
              </div>

              {!isInvitedUser && (
                <div className="space-y-2">
                  <Label htmlFor="accountType">Account Type</Label>
                  <Select onValueChange={(value) => setAccountType(value)} value={accountType}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select account type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="host">Host (Team Manager)</SelectItem>
                      <SelectItem value="participant">Participant (Team Member)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}


              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="Create a strong password"
                    value={formData.password}
                    onChange={(e) => handleInputChange("password", e.target.value)}
                    required
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>

                {/* Password Requirements */}
                {formData.password && (
                  <div className="mt-2 space-y-1">
                    <div
                      className={`flex items-center text-xs ${passwordValidation.minLength ? "text-green-600" : "text-red-600"}`}
                    >
                      {passwordValidation.minLength ? <Check className="h-3 w-3 mr-1" /> : <X className="h-3 w-3 mr-1" />}
                      At least 8 characters
                    </div>
                    <div
                      className={`flex items-center text-xs ${passwordValidation.hasNumber ? "text-green-600" : "text-red-600"}`}
                    >
                      {passwordValidation.hasNumber ? <Check className="h-3 w-3 mr-1" /> : <X className="h-3 w-3 mr-1" />}
                      At least 1 number
                    </div>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Confirm Password</Label>
                <div className="relative">
                  <Input
                    id="confirmPassword"
                    type={showPassword ? "text" : "password"}
                    placeholder="Confirm your password"
                    value={formData.confirmPassword}
                    onChange={(e) => handleInputChange("confirmPassword", e.target.value)}
                    required
                  />
                </div>
                
                {/* Password Match Indicator */}
                {formData.confirmPassword && (
                  <div className="mt-2">
                    <div
                      className={`flex items-center text-xs ${passwordsMatch ? "text-green-600" : "text-red-600"}`}
                    >
                      {passwordsMatch ? <Check className="h-3 w-3 mr-1" /> : <X className="h-3 w-3 mr-1" />}
                      {passwordsMatch ? "Passwords match" : "Passwords do not match"}
                    </div>
                  </div>
                )}
              </div>

              {error && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              {success && (
                <Alert>
                  <AlertDescription>{success}</AlertDescription>
                </Alert>
              )}

              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? (
                  <div className="flex items-center space-x-2">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    <span>Processing...</span>
                  </div>
                ) : (
                  'Join Team'
                )}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex items-center justify-center space-x-2 mb-4">
            <Calendar className="h-8 w-8 text-blue-600" />
            <span className="text-2xl font-bold">AISchedulator</span>
          </div>
          
          <CardTitle className="text-2xl">Create your account</CardTitle>
          <CardDescription>Join thousands of medical professionals</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="firstName">First Name</Label>
                <Input
                  id="firstName"
                  placeholder="John"
                  value={formData.firstName}
                  onChange={(e) => handleInputChange("firstName", e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="lastName">Last Name</Label>
                <Input
                  id="lastName"
                  placeholder="Doe"
                  value={formData.lastName}
                  onChange={(e) => handleInputChange("lastName", e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="doctor@hospital.com"
                value={formData.email}
                onChange={(e) => handleInputChange("email", e.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="accountType">Account Type</Label>
              <Select onValueChange={(value) => setAccountType(value)} value={accountType}>
                <SelectTrigger>
                  <SelectValue placeholder="Select account type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="host">Host (Team Manager)</SelectItem>
                  <SelectItem value="participant">Participant (Team Member)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="Create a strong password"
                  value={formData.password}
                  onChange={(e) => handleInputChange("password", e.target.value)}
                  required
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>

              {/* Password Requirements */}
              {formData.password && (
                <div className="mt-2 space-y-1">
                  <div
                    className={`flex items-center text-xs ${passwordValidation.minLength ? "text-green-600" : "text-red-600"}`}
                  >
                    {passwordValidation.minLength ? <Check className="h-3 w-3 mr-1" /> : <X className="h-3 w-3 mr-1" />}
                    At least 8 characters
                  </div>
                  <div
                    className={`flex items-center text-xs ${passwordValidation.hasNumber ? "text-green-600" : "text-red-600"}`}
                  >
                    {passwordValidation.hasNumber ? <Check className="h-3 w-3 mr-1" /> : <X className="h-3 w-3 mr-1" />}
                    At least 1 number
                  </div>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirm Password</Label>
              <div className="relative">
                <Input
                  id="confirmPassword"
                  type={showPassword ? "text" : "password"}
                  placeholder="Confirm your password"
                  value={formData.confirmPassword}
                  onChange={(e) => handleInputChange("confirmPassword", e.target.value)}
                  required
                />
              </div>
              
              {/* Password Match Indicator */}
              {formData.confirmPassword && (
                <div className="mt-2">
                  <div
                    className={`flex items-center text-xs ${passwordsMatch ? "text-green-600" : "text-red-600"}`}
                  >
                    {passwordsMatch ? <Check className="h-3 w-3 mr-1" /> : <X className="h-3 w-3 mr-1" />}
                    {passwordsMatch ? "Passwords match" : "Passwords do not match"}
                  </div>
                </div>
              )}
            </div>

            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {success && (
              <Alert>
                <AlertDescription>{success}</AlertDescription>
              </Alert>
            )}

            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? (
                <div className="flex items-center space-x-2">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  <span>Processing...</span>
                </div>
              ) : (
                'Create Account'
              )}
            </Button>
          </form>

          <div className="mt-4 text-center text-sm">
            {"Already have an account? "}
            <Link href="/auth/signin" className="text-blue-600 hover:underline">
              Sign in
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
