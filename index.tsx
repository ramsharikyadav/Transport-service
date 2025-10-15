import React, { useState, useEffect, useRef, useMemo } from 'react';
import ReactDOM from 'react-dom/client';
import { GoogleGenAI, Type } from '@google/genai';

// FIX: Add interfaces for vehicle data structures to ensure type safety.
interface Vehicle {
  plate: string;
  model: string;
}

interface VehicleTypeDetails {
  capacity: number;
  vehicles: Vehicle[];
}

// FIX: Replaced `VehicleTypes` interface with a `type` alias using `Record`.
// This provides better type inference for dictionary-like objects and resolves
// multiple errors where properties were being incorrectly inferred as `unknown`.
type VehicleTypes = Record<string, VehicleTypeDetails>;

// FIX: Add interfaces for Booking and Driver for type safety.
interface Driver {
  name: string;
  phone: string;
  username: string;
  password?: string;
  status: 'online' | 'offline';
  position?: { lat: number; lng: number };
  avatar?: string;
}

interface Booking {
  confirmationNumber: string;
  confirmationMessage: string;
  estimatedFare: number;
  estimatedTripDuration: string;
  estimatedArrivalTime: string;
  guestName: string;
  guestPhone: string;
  location: string;
  date: string;
  time: string;
  serviceType: string;
  vehicleType: string;
  driverName: string | null;
  driverPhone: string | null;
  assignedVehicle: Vehicle | null;
  bookingStatus: 'confirmed' | 'assigned' | 'cancelled';
  driverStatus?: 'online' | 'offline' | 'arrived';
  driverPosition?: { x: number; y: number };
  paymentStatus: 'pending' | 'paid';
  paymentId?: string;
  eta?: string;
}

const defaultAvatarSvg = `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="%236c757d" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`;


const INITIAL_VEHICLE_TYPES: VehicleTypes = {
  'Standard Sedan': {
    capacity: 4,
    vehicles: [
        { plate: 'MP20TA7001', model: 'Tata Tigor XM EV' },
        { plate: 'MP20TA7002', model: 'Tata Tigor XM EV' },
        { plate: 'MP20TA7003', model: 'Tata Tigor XM EV' },
        { plate: 'MP20ZL9504', model: 'Tata Tigor XM EV' },
        { plate: 'MP20ZL9505', model: 'Tata Tigor XM EV' }
    ]
  },
  'SUV': {
    capacity: 6,
    vehicles: [
        { plate: 'MP20TA1969', model: 'Toyota Innova' }
    ]
  },
};


const INITIAL_DRIVERS: Driver[] = [
  { name: 'Ravi Kumar', phone: '9876543210', username: 'ravi', password: 'password123', status: 'online', avatar: defaultAvatarSvg },
  { name: 'Sunita Sharma', phone: '8765432109', username: 'sunita', password: 'password123', status: 'online', avatar: defaultAvatarSvg },
  { name: 'Amit Singh', phone: '7654321098', username: 'amit', password: 'password123', status: 'online', avatar: defaultAvatarSvg },
  { name: 'Priya Patel', phone: '6543210987', username: 'priya', password: 'password123', status: 'online', avatar: defaultAvatarSvg },
];


const App = () => {
  // App-level state
  const [currentUserRole, setCurrentUserRole] = useState('guest'); // 'guest', 'login', 'admin', 'driver'
  const [loginRole, setLoginRole] = useState(''); // 'admin' or 'driver'
  // FIX: Provide explicit types for state variables to enhance type safety.
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>(INITIAL_DRIVERS);
  // FIX: Explicitly type the vehicleTypes state to resolve property access errors.
  const [vehicleTypes, setVehicleTypes] = useState<VehicleTypes>(INITIAL_VEHICLE_TYPES);
  const [loginError, setLoginError] = useState('');
  const [isLoginPopoverOpen, setIsLoginPopoverOpen] = useState(false);
  const [loggedInDriver, setLoggedInDriver] = useState<Driver | null>(null); // State for the logged-in driver object
  const [notifications, setNotifications] = useState<{id: number, message: string, type: string}[]>([]);
  const loginPopoverRef = useRef(null);
  const loginIconRef = useRef(null);
  const intervalRefs = useRef<{[key: string]: number}>({});
  const [razorpayKey, setRazorpayKey] = useState<string>('');


  // Form state
  const [serviceType, setServiceType] = useState('pickup');
  const [location, setLocation] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [passengers, setPassengers] = useState(1);
  const [selectedVehicleType, setSelectedVehicleType] = useState('Standard Sedan');
  const [guestName, setGuestName] = useState('');
  const [guestPhone, setGuestPhone] = useState('');
  const [formError, setFormError] = useState('');

  // UI State
  const [isLoading, setIsLoading] = useState(false);
  const [isConfirmationVisible, setIsConfirmationVisible] = useState(false);
  const [lastBooking, setLastBooking] = useState<Booking | null>(null);
  const [isTermsModalVisible, setIsTermsModalVisible] = useState(false);
  const [suggestedLocations, setSuggestedLocations] = useState<string[]>([]);
  const [activeLocationSuggestions, setActiveLocationSuggestions] = useState(false);
  const locationInputRef = useRef<HTMLInputElement>(null);
  const [isEditingAssignment, setIsEditingAssignment] = useState<string | null>(null);
  const debounceTimeoutRef = useRef<number | null>(null);
  const [isFetchingSuggestions, setIsFetchingSuggestions] = useState(false);


  // Guest Tracking State
  const [isTracking, setIsTracking] = useState(false);
  const [trackingPhone, setTrackingPhone] = useState('');
  const [trackingError, setTrackingError] = useState('');
  const [guestBookings, setGuestBookings] = useState<Booking[]>([]);
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null);


  // API Key and Config checks
  useEffect(() => {
    const savedKey = localStorage.getItem('razorpayApiKey');
    if (savedKey) {
        setRazorpayKey(savedKey);
    }
  }, []);

  // Click outside handler for popover
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
        if (
            isLoginPopoverOpen &&
            loginPopoverRef.current &&
            !(loginPopoverRef.current as any).contains(event.target) &&
            loginIconRef.current &&
            !(loginIconRef.current as any).contains(event.target)
        ) {
            setIsLoginPopoverOpen(false);
        }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isLoginPopoverOpen]);

  // Click outside handler for location suggestions
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
        if (activeLocationSuggestions && locationInputRef.current && !locationInputRef.current.contains(event.target as Node)) {
            setActiveLocationSuggestions(false);
        }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [activeLocationSuggestions]);


  const addNotification = (message: string, type: 'success' | 'error' | 'info') => {
    const id = Date.now();
    setNotifications(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setNotifications(prev => prev.filter(n => n.id !== id));
    }, 5000);
  };

  const isTimeOverlapping = (bookingA: Booking, bookingB: Booking): boolean => {
    const DURATION_MS = 90 * 60 * 1000; // Assume 90-minute duration for each trip

    const startA = new Date(`${bookingA.date}T${bookingA.time}`).getTime();
    if (isNaN(startA)) return false; // Invalid date
    const endA = startA + DURATION_MS;

    const startB = new Date(`${bookingB.date}T${bookingB.time}`).getTime();
    if (isNaN(startB)) return false; // Invalid date
    const endB = startB + DURATION_MS;
    
    // Overlap condition: A starts before B ends AND A ends after B starts
    return startA < endB && endA > startB;
  };

  const handleLocationChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setLocation(value);

    if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
    }

    if (value.length > 2) {
        setIsFetchingSuggestions(true);
        setActiveLocationSuggestions(false); // Hide old suggestions
        debounceTimeoutRef.current = window.setTimeout(async () => {
            try {
                const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });

                const schema = {
                    type: Type.OBJECT,
                    properties: {
                        locations: {
                            type: Type.ARRAY,
                            description: "A list of suggested location names.",
                            items: { type: Type.STRING }
                        }
                    }
                };

                const response = await ai.models.generateContent({
                    model: "gemini-2.5-flash",
                    contents: `List up to 5 well-known transport hubs or landmarks in Jabalpur, India that match the search: "${value}". Examples: Airport, Railway Station, Bus Stand, prominent hotels or malls.`,
                    config: {
                        responseMimeType: "application/json",
                        responseSchema: schema,
                    },
                });

                const resultJson = JSON.parse(response.text);

                if (resultJson.locations && Array.isArray(resultJson.locations)) {
                    const filtered = resultJson.locations.filter(loc => loc.toLowerCase() !== value.toLowerCase());
                    setSuggestedLocations(filtered);
                    if (filtered.length > 0) {
                        setActiveLocationSuggestions(true);
                    }
                } else {
                    setSuggestedLocations([]);
                    setActiveLocationSuggestions(false);
                }

            } catch (error) {
                console.error("Error fetching location suggestions:", error);
                setSuggestedLocations([]);
                setActiveLocationSuggestions(false);
            } finally {
                setIsFetchingSuggestions(false);
            }
        }, 400); // 400ms debounce
    } else {
        setIsFetchingSuggestions(false);
        setSuggestedLocations([]);
        setActiveLocationSuggestions(false);
    }
  };

  const handleSuggestionClick = (suggestion: string) => {
      setLocation(suggestion);
      setSuggestedLocations([]);
      setActiveLocationSuggestions(false);
  };


  const estimateFare = () => {
    const GST_RATE = 0.18;
    const SUV_MULTIPLIER = 1.5;
    
    // Base fares before vehicle type multiplier and GST
    const FARE_AIRPORT = 500;
    const FARE_STATION = 250;
    const FARE_OTHER_WITHIN_5KM = 250;
    const FARE_OTHER_ABOVE_5KM = 500;

    let baseFare = FARE_OTHER_ABOVE_5KM; // Default for unspecified locations
    const normalizedLocation = location.toLowerCase().trim();

    if (normalizedLocation.includes('airport')) {
        baseFare = FARE_AIRPORT;
    } else if (
        normalizedLocation.includes('jabalpur railway station') ||
        normalizedLocation.includes('madan mahal railway station') ||
        normalizedLocation.includes('jabalpur station') ||
        normalizedLocation.includes('madan mahal station')
    ) {
        baseFare = FARE_STATION;
    }
    // NOTE: The prompt specifies different rates for "other" locations based on distance (<5km or >5km).
    // Without a mapping API to calculate distance from the user's text input, we cannot reliably
    // determine this. Therefore, we are defaulting all non-landmark locations to the higher tier fare.
    // A future enhancement could integrate a distance calculation service.
    
    let fareBeforeGst = baseFare;
    if (selectedVehicleType === 'SUV') {
      fareBeforeGst *= SUV_MULTIPLIER;
    }

    const finalFare = fareBeforeGst * (1 + GST_RATE);

    return Math.round(finalFare);
  };


  const handleBooking = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!guestName || !guestPhone || !location || !date || !time) {
        setFormError("Please fill out all required fields.");
        return;
    }
    setFormError("");
    setIsLoading(true);

    try {
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });

        const schema = {
            type: Type.OBJECT,
            properties: {
                confirmationNumber: { type: Type.STRING, description: 'A unique 6-character alphanumeric confirmation code.' },
                confirmationMessage: { type: Type.STRING, description: 'A polite confirmation message for the guest.' },
                estimatedTripDuration: { type: Type.STRING, description: 'Estimated trip duration (e.g., "approx. 25 minutes").' },
                estimatedArrivalTime: { type: Type.STRING, description: 'Estimated arrival time of the cab at the pickup location (e.g., "in 10 minutes").' },
            }
        };

        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: `Generate booking confirmation details for a cab service for the Shawn Elizey hotel. Guest: ${guestName}, Phone: ${guestPhone}, Location: ${location}, Date: ${date}, Time: ${time}, Service: ${serviceType}, Vehicle: ${selectedVehicleType}. Create a unique confirmation number.`,
            config: {
                responseMimeType: "application/json",
                responseSchema: schema,
            },
        });

        const resultJson = JSON.parse(response.text);

        const newBooking: Booking = {
          ...resultJson,
          estimatedFare: estimateFare(),
          guestName,
          guestPhone,
          location,
          date,
          time,
          serviceType,
          vehicleType: selectedVehicleType,
          driverName: null,
          driverPhone: null,
          assignedVehicle: null,
          bookingStatus: 'confirmed',
          driverStatus: 'offline', // default status
          driverPosition: { x: 15, y: 50 }, // Initial position
          paymentStatus: 'pending',
        };

        setBookings(prev => [...prev, newBooking]);
        setLastBooking(newBooking);
        setIsConfirmationVisible(true);
        // Reset form
        setGuestName('');
        setGuestPhone('');
        setLocation('');
        setDate('');
        setTime('');
        setPassengers(1);
    } catch (error) {
        console.error("Error generating booking confirmation:", error);
        addNotification("Failed to create booking. Please try again.", "error");
        setFormError("An unexpected error occurred. Please try again later.");
    } finally {
        setIsLoading(false);
    }
  };

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    const form = e.target as HTMLFormElement;
    const username = (form.elements.namedItem('username') as HTMLInputElement).value;
    const password = (form.elements.namedItem('password') as HTMLInputElement).value;
    setLoginError('');

    if (loginRole === 'admin') {
      if (username === 'admin' && password === 'admin123') {
        setCurrentUserRole('admin');
        addNotification('Successfully logged in as Admin.', 'success');
      } else {
        setLoginError('Invalid admin credentials.');
      }
    } else if (loginRole === 'driver') {
      const driver = drivers.find(d => d.username === username && d.password === password);
      if (driver) {
        setLoggedInDriver(driver);
        setCurrentUserRole('driver');
        addNotification(`Welcome, ${driver.name}!`, 'success');
      } else {
        setLoginError('Invalid driver credentials.');
      }
    }
  };

  const handleLogout = () => {
    if (currentUserRole === 'admin' || currentUserRole === 'driver') {
        addNotification('You have been logged out.', 'info');
    }
    // Reset user session state
    setCurrentUserRole('guest');
    setLoginRole('');
    setLoggedInDriver(null);
    setIsLoginPopoverOpen(false);
    setLoginError('');

    // Reset guest tracking state
    setIsTracking(false);
    setTrackingPhone('');
    setGuestBookings([]);
    setSelectedBooking(null);
    setTrackingError('');

    // Reset booking form state to initial values
    setServiceType('pickup');
    setLocation('');
    setDate('');
    setTime('');
    setPassengers(1);
    setSelectedVehicleType('Standard Sedan');
    setGuestName('');
    setGuestPhone('');
    setFormError('');

    // Reset UI state
    setIsConfirmationVisible(false);
    setLastBooking(null);
    setIsTermsModalVisible(false);
    setSuggestedLocations([]);
    setActiveLocationSuggestions(false);
    setIsEditingAssignment(null);
  };
  
  const handleAssignDriver = (bookingConfirmation: string, driverName: string, vehiclePlate: string) => {
    const driver = drivers.find(d => d.name === driverName) || null;
    const vehicleTypeKey = Object.keys(vehicleTypes).find(key => 
      vehicleTypes[key].vehicles.some(v => v.plate === vehiclePlate)
    );
    const vehicle = vehicleTypeKey ? vehicleTypes[vehicleTypeKey].vehicles.find(v => v.plate === vehiclePlate) || null : null;
  
    setBookings(prev => prev.map(b => 
      b.confirmationNumber === bookingConfirmation 
        ? { ...b, driverName, driverPhone: driver?.phone || null, assignedVehicle: vehicle, driverStatus: driver?.status || 'offline', bookingStatus: 'assigned' }
        : b
    ));
    addNotification(`Driver assigned to booking #${bookingConfirmation.slice(-4)}`, 'success');
    setIsEditingAssignment(null);
  };

  const handleCancelBooking = (confirmationNumber: string) => {
    setBookings(prev => prev.map(b => {
        if (b.confirmationNumber === confirmationNumber) {
            return { 
                ...b, 
                bookingStatus: 'cancelled',
                driverName: null,
                driverPhone: null,
                assignedVehicle: null,
                driverStatus: 'offline' // Reset driver status
            };
        }
        return b;
    }));
    
    // Update guest-specific state if they are viewing the booking
    setGuestBookings(prev => prev.map(b => 
        b.confirmationNumber === confirmationNumber ? { ...b, bookingStatus: 'cancelled' } : b
    ));
    if (selectedBooking?.confirmationNumber === confirmationNumber) {
        setSelectedBooking(prev => prev ? { ...prev, bookingStatus: 'cancelled' } : null);
    }

    addNotification(`Booking #${confirmationNumber.slice(-4)} has been cancelled.`, 'info');
  };

  const handleTrackBooking = (e: React.FormEvent) => {
    e.preventDefault();
    setTrackingError('');
    const foundBookings = bookings
        .filter(b => b.guestPhone === trackingPhone)
        .sort((a, b) => new Date(`${b.date}T${b.time}`).getTime() - new Date(`${a.date}T${a.time}`).getTime());

    if (foundBookings.length > 0) {
        setGuestBookings(foundBookings);
        setSelectedBooking(null); // Unselect any previously selected booking
    } else {
        setTrackingError('No bookings found for this mobile number.');
        setGuestBookings([]);
        setSelectedBooking(null);
    }
  };

  const handlePayment = (booking: Booking) => {
    if (!(window as any).Razorpay) {
      addNotification('Payment gateway is not available. Please try again later.', 'error');
      return;
    }
    if (!razorpayKey) {
        addNotification('Payment gateway is not configured. Please contact support.', 'error');
        return;
    }

    const options = {
      key: razorpayKey,
      amount: booking.estimatedFare * 100, // Amount in the smallest currency unit (paise)
      currency: 'INR',
      name: 'Shawn Elizey Transport',
      description: `Payment for Booking #${booking.confirmationNumber.slice(-4)}`,
      handler: (response: any) => {
        const paymentId = response.razorpay_payment_id;
        addNotification('Payment Successful! Thank you.', 'success');

        const updatePaymentStatus = (b: Booking): Booking => ({
          ...b,
          paymentStatus: 'paid' as 'paid',
          paymentId: paymentId,
        });

        // Update main bookings state
        setBookings(prev => prev.map(b => 
          b.confirmationNumber === booking.confirmationNumber ? updatePaymentStatus(b) : b
        ));

        // Update state for currently viewed bookings
        if (lastBooking?.confirmationNumber === booking.confirmationNumber) {
          setLastBooking(prev => prev ? updatePaymentStatus(prev) : null);
        }
        if (selectedBooking?.confirmationNumber === booking.confirmationNumber) {
          setSelectedBooking(prev => prev ? updatePaymentStatus(prev) : null);
        }
        setGuestBookings(prev => prev.map(b => 
            b.confirmationNumber === booking.confirmationNumber ? updatePaymentStatus(b) : b
        ));
      },
      prefill: {
        name: booking.guestName,
        contact: booking.guestPhone,
      },
      theme: {
        color: '#1D3557',
      },
      modal: {
        ondismiss: () => {
          addNotification('Payment was cancelled.', 'info');
        },
      },
    };

    const rzp = new (window as any).Razorpay(options);
    rzp.open();
  };
  
  const handleSaveRazorpayKey = (key: string) => {
    setRazorpayKey(key);
    localStorage.setItem('razorpayApiKey', key);
    addNotification('Razorpay API Key saved successfully.', 'success');
  };

  const calculateSimulatedETA = (progress: number): string => {
    if (progress >= 1) return "Arrived";
    if (progress > 0.95) return "Arriving now";
    
    const totalMinutes = 15; // The simulated journey starts at 15 minutes
    const remainingMinutes = Math.round(totalMinutes * (1 - progress));

    if (remainingMinutes <= 1) return "Less than a minute";
    return `approx. ${remainingMinutes} mins`;
  };

  const renderHeader = () => (
    <header>
      <div className="header-branding">
        <svg className="header-logo" width="48" height="48" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M18.333 5.333V3.5C18.333 3.224 18.109 3 17.833 3H16.5C16.224 3 16 3.224 16 3.5V5.333M6 5.333V3.5C6 3.224 6.224 3 6.5 3H7.833C8.109 3 8.333 3.224 8.333 3.5V5.333M20.5 11.5L19.233 8.34C19.099 8.01 18.788 7.8 18.438 7.8H5.562C5.212 7.8 4.901 8.01 4.767 8.34L3.5 11.5M20.5 11.5H3.5M20.5 11.5V17.5C20.5 18.328 19.828 19 19 19H18M3.5 11.5V17.5C3.5 18.328 4.172 19 5 19H6M14 19H10M17.5 15.5H18.5M5.5 15.5H6.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M14 21H10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M12 7V3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
        <div className="header-title-group">
            <h1>Shawn Elizey</h1>
            <p>Hotel Transport Service</p>
        </div>
      </div>
      <div className="header-actions">
        {currentUserRole === 'guest' && (
             <button
             className="icon-btn"
             aria-label="Track Your Booking"
             title="Track Your Booking"
             onClick={() => { setIsTracking(true); setIsLoginPopoverOpen(false); }}
           >
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20z"/><path d="M2 12h20"/></svg>
           </button>
        )}
        <div className="login-action-wrapper">
            <button
            ref={loginIconRef}
            className="icon-btn"
            aria-label={currentUserRole !== 'guest' ? 'Logout' : 'Login Options'}
            title={currentUserRole !== 'guest' ? 'Logout' : 'Login Options'}
            onClick={() => {
                if (currentUserRole !== 'guest') {
                handleLogout();
                } else {
                setIsLoginPopoverOpen(!isLoginPopoverOpen);
                setIsTracking(false);
                }
            }}
            >
            {currentUserRole !== 'guest' ? (
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
            ) : (
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
            )}
            </button>
            {isLoginPopoverOpen && (
                <div ref={loginPopoverRef} className="login-popover">
                    <h4>Login As</h4>
                    <button onClick={() => { setCurrentUserRole('login'); setLoginRole('admin'); setIsLoginPopoverOpen(false); }}>Administrator</button>
                    <button onClick={() => { setCurrentUserRole('login'); setLoginRole('driver'); setIsLoginPopoverOpen(false); }}>Driver</button>
                </div>
            )}
        </div>
      </div>
    </header>
  );

  const renderBookingForm = () => (
    <form onSubmit={handleBooking}>
      <div className="service-type">
        <label>
          <input type="radio" name="service" value="pickup" checked={serviceType === 'pickup'} onChange={() => setServiceType('pickup')} />
          <span>Pickup</span>
        </label>
        <label>
          <input type="radio" name="service" value="dropoff" checked={serviceType === 'dropoff'} onChange={() => setServiceType('dropoff')} />
          <span>Drop-off</span>
        </label>
      </div>

      <div className="form-group">
        <label htmlFor="guestName">Full Name</label>
        <input type="text" id="guestName" value={guestName} onChange={(e) => setGuestName(e.target.value)} placeholder="Enter your full name" required />
      </div>

      <div className="form-group">
        <label htmlFor="guestPhone">Mobile Number</label>
        <input type="tel" id="guestPhone" value={guestPhone} onChange={(e) => setGuestPhone(e.target.value)} placeholder="Enter your mobile number" required />
      </div>

      <div className="form-group">
        <label htmlFor="location">{serviceType === 'pickup' ? 'Pickup Location' : 'Drop-off Location'}</label>
        <div className="location-input-wrapper" ref={locationInputRef}>
            <input
                type="text"
                id="location"
                value={location}
                onChange={handleLocationChange}
                onFocus={() => suggestedLocations.length > 0 && setActiveLocationSuggestions(true)}
                placeholder="e.g., Jabalpur Airport"
                required
                autoComplete="off"
            />
            {isFetchingSuggestions && <div className="suggestion-loader"></div>}
            {activeLocationSuggestions && suggestedLocations.length > 0 && (
                <ul className="suggestions-container">
                    {suggestedLocations.map(item => (
                        <li key={item} className="suggestion-item" onClick={() => handleSuggestionClick(item)}>
                            {item}
                        </li>
                    ))}
                </ul>
            )}
        </div>
      </div>


      <div className="form-row">
        <div className="form-group">
          <label htmlFor="date">Date</label>
          <input type="date" id="date" value={date} onChange={(e) => setDate(e.target.value)} required />
        </div>
        <div className="form-group">
          <label htmlFor="time">Time</label>
          <input type="time" id="time" value={time} onChange={(e) => setTime(e.target.value)} required />
        </div>
      </div>

      <div className="form-row">
        <div className="form-group">
          <label htmlFor="passengers">Passengers</label>
          <input type="number" id="passengers" min="1" max="6" value={passengers} onChange={(e) => setPassengers(parseInt(e.target.value))} required />
        </div>
        <div className="form-group">
          <label htmlFor="vehicleType">Vehicle Type</label>
          <select id="vehicleType" value={selectedVehicleType} onChange={(e) => setSelectedVehicleType(e.target.value)}>
             {Object.keys(vehicleTypes).map(type => (
                <option key={type} value={type}>{type} (Max {vehicleTypes[type].capacity})</option>
             ))}
          </select>
        </div>
      </div>

      <div className="fare-estimate">
        <strong>Estimated Fare</strong>
        <span>₹{estimateFare()}</span>
      </div>
      
      {formError && <p className="form-error">{formError}</p>}
      
      <div className="terms-link-container">
        <a href="#" onClick={(e) => { e.preventDefault(); setIsTermsModalVisible(true); }}>
            View Terms and Conditions
        </a>
      </div>

      <button type="submit" className="primary-btn" disabled={isLoading}>
        {isLoading ? 'Booking...' : 'Book Now'}
      </button>
    </form>
  );
  
  const InteractiveMap = ({ booking }: { booking: Booking | null }) => {
    const [transform, setTransform] = useState({ scale: 1, x: 0, y: 0 });
    const [isPanning, setIsPanning] = useState(false);
    const [panStart, setPanStart] = useState({ x: 0, y: 0 });
    const mapRef = useRef<HTMLDivElement>(null);

    if (!booking) return null;

    const handleWheel = (e: React.WheelEvent) => {
        e.preventDefault();
        const scaleAmount = -e.deltaY * 0.001;
        const newScale = Math.min(Math.max(0.5, transform.scale + scaleAmount), 3);

        if (mapRef.current) {
            const rect = mapRef.current.getBoundingClientRect();
            const mouseX = e.clientX - rect.left;
            const mouseY = e.clientY - rect.top;
            
            const newX = transform.x + (mouseX - transform.x) * (1 - newScale / transform.scale);
            const newY = transform.y + (mouseY - transform.y) * (1 - newScale / transform.scale);

            setTransform({ scale: newScale, x: newX, y: newY });
        }
    };
    
    const handleMouseDown = (e: React.MouseEvent) => {
        setIsPanning(true);
        setPanStart({ x: e.clientX - transform.x, y: e.clientY - transform.y });
    };

    const handleMouseMove = (e: React.MouseEvent) => {
        if (!isPanning) return;
        setTransform(prev => ({ ...prev, x: e.clientX - panStart.x, y: e.clientY - panStart.y }));
    };

    const handleMouseUpOrLeave = () => {
        setIsPanning(false);
    };

    const handleZoom = (direction: 'in' | 'out') => {
        const scaleAmount = direction === 'in' ? 0.2 : -0.2;
        const newScale = Math.min(Math.max(0.5, transform.scale + scaleAmount), 3);
        setTransform(prev => ({ ...prev, scale: newScale }));
    };

    const resetZoom = () => {
        setTransform({ scale: 1, x: 0, y: 0 });
    };

    return (
        <div 
            ref={mapRef}
            className={`map-container interactive-map-container ${isPanning ? 'is-panning' : ''}`}
            onWheel={handleWheel}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUpOrLeave}
            onMouseLeave={handleMouseUpOrLeave}
        >
            <div 
                className="map-content-wrapper"
                style={{ transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`}}
            >
                <svg className="map-route-line" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
                    <line x1="15%" y1="50%" x2="85%" y2="50%" strokeDasharray="4, 4" />
                </svg>
                <div className="map-point start-point" style={{ left: '15%', top: '50%' }}>P</div>
                <div className="map-point end-point" style={{ left: '85%', top: '50%' }}>D</div>
                {booking.driverPosition && booking.driverStatus !== 'offline' && (
                  <div className="driver-icon" style={{ left: `${booking.driverPosition.x}%`, top: `${booking.driverPosition.y}%` }}>
                    <svg viewBox="0 0 24 24" fill="currentColor"><path d="M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11c-.66 0-1.21.42-1.42 1.01L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99zM6.5 16c-.83 0-1.5-.67-1.5-1.5S5.67 13 6.5 13s1.5.67 1.5 1.5S7.33 16 6.5 16zm11 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zM5 11l1.5-4.5h11L19 11H5z"/></svg>
                  </div>
                )}
            </div>
            <div className="map-title">Live Tracking</div>
            <div className="map-controls">
                <button onClick={() => handleZoom('in')} className="map-control-btn" aria-label="Zoom In" title="Zoom In">+</button>
                <button onClick={() => handleZoom('out')} className="map-control-btn" aria-label="Zoom Out" title="Zoom Out">-</button>
                <button onClick={resetZoom} className="map-control-btn" aria-label="Reset View" title="Reset View">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 11A8.1 8.1 0 0 0 4.5 9M4 5v4h4"/><path d="M4 13a8.1 8.1 0 0 0 15.5 2m.5 4v-4h-4"/></svg>
                </button>
            </div>
             {(!booking.driverName || booking.driverStatus === 'offline') && (
                <div className="map-message">
                    Awaiting driver assignment. Tracking will be available soon.
                </div>
            )}
        </div>
    );
  };


  const renderConfirmation = () => {
    if (!lastBooking) return null;
    return (
        <div className="confirmation-container view-enter-active">
            <div className="checkmark-container">
                <svg className="checkmark-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 52 52">
                    <circle className="checkmark-circle" cx="26" cy="26" r="25" fill="none"/>
                    <path className="checkmark-check" fill="none" d="M14.1 27.2l7.1 7.2 16.7-16.8"/>
                </svg>
            </div>
            <h2>Booking Confirmed!</h2>
            <p>{lastBooking.confirmationMessage}</p>

            <InteractiveMap booking={lastBooking} />

            <div className="details-grid">
                <p><strong>Confirmation #</strong> {lastBooking.confirmationNumber}</p>
                <p><strong>Guest Name</strong> {lastBooking.guestName}</p>
                <p><strong>Pickup Date</strong> {lastBooking.date} at {lastBooking.time}</p>
                <p><strong>Location</strong> {lastBooking.location}</p>
                <p><strong>Est. Fare</strong> ₹{lastBooking.estimatedFare}</p>
                <p><strong>Payment</strong> <span className={`payment-status-badge ${lastBooking.paymentStatus}`}>{lastBooking.paymentStatus}</span></p>
            </div>
            
            <p className="assignment-notice">
                You will receive an update once a driver and vehicle have been assigned to your booking.
            </p>

            <div className="confirmation-actions">
                <button className="secondary-btn" onClick={() => setIsConfirmationVisible(false)}>
                    New Booking
                </button>
                {lastBooking.paymentStatus === 'pending' ? (
                  <button 
                    className="primary-btn pay-btn" 
                    onClick={() => handlePayment(lastBooking)}
                    disabled={!razorpayKey}
                    title={!razorpayKey ? 'Online payments are currently unavailable' : ''}
                  >
                    Pay Now (₹{lastBooking.estimatedFare})
                  </button>
                ) : (
                  <button className="primary-btn paid-btn" disabled>
                    ✓ Paid
                  </button>
                )}
            </div>
        </div>
    );
  };

  const renderLogin = () => (
    <div className="login-container view-enter-active">
        <button className="back-button" onClick={() => setCurrentUserRole('guest')}>&larr; Back</button>
        <h2>{loginRole === 'admin' ? 'Admin' : 'Driver'} Login</h2>
        <form className="login-form" onSubmit={handleLogin}>
            <div className="form-group">
                <label htmlFor="username">Username</label>
                <input type="text" id="username" name="username" required />
            </div>
            <div className="form-group">
                <label htmlFor="password">Password</label>
                <input type="password" id="password" name="password" required />
            </div>
            {loginError && <p className="form-error">{loginError}</p>}
            <button type="submit" className="primary-btn">Login</button>
        </form>
    </div>
  );

  // FIX: Moved `LiveMapComponent` outside of the `AdminDashboard` component. Defining a component that uses React Hooks inside another component is an invalid pattern that can lead to runtime errors and unpredictable behavior, including type inference failures.
  const LiveMapComponent: React.FC<{ drivers: Driver[] }> = ({ drivers }) => {
    const [hoveredDriver, setHoveredDriver] = useState<Driver | null>(null);

    const JABALPUR_BOUNDS = {
        minLat: 23.1, maxLat: 23.25,
        minLng: 79.85, maxLng: 80.05
    };

    const onlineDrivers = useMemo(() => {
        return drivers.filter(d => d.status === 'online' && d.position);
    }, [drivers]);

    const mapCoordsToSvg = (lat: number, lng: number) => {
        const x = ((lng - JABALPUR_BOUNDS.minLng) / (JABALPUR_BOUNDS.maxLng - JABALPUR_BOUNDS.minLng)) * 100;
        const y = ((JABALPUR_BOUNDS.maxLat - lat) / (JABALPUR_BOUNDS.maxLat - JABALPUR_BOUNDS.minLat)) * 100;
        return { x, y };
    };

    return (
        <div className="live-map-container">
            <svg className="live-map-svg" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet">
                {/* Placeholder for map background */}
                <rect width="100" height="100" fill="#e9f5ff" />
                <text x="50" y="50" textAnchor="middle" fill="#cde4f7" fontSize="10" fontWeight="bold">Jabalpur Area</text>

                {onlineDrivers.map(driver => {
                    const { x, y } = mapCoordsToSvg(driver.position!.lat, driver.position!.lng);
                    const isHovered = hoveredDriver?.username === driver.username;
                    return (
                        <g 
                            key={driver.username}
                            transform={`translate(${x}, ${y}) scale(${isHovered ? 1.5 : 1})`}
                            className="driver-map-icon-group"
                            onMouseEnter={() => setHoveredDriver(driver)}
                            onMouseLeave={() => setHoveredDriver(null)}
                        >
                            <circle cx="0" cy="0" r="2.5" className={`driver-map-pulse ${isHovered ? 'highlighted' : ''}`} />
                            <svg x="-1.5" y="-1.5" width="3" height="3" viewBox="0 0 24 24" fill="currentColor" className="driver-map-icon"><path d="M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11c-.66 0-1.21.42-1.42 1.01L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99zM6.5 16c-.83 0-1.5-.67-1.5-1.5S5.67 13 6.5 13s1.5.67 1.5 1.5S7.33 16 6.5 16zm11 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zM5 11l1.5-4.5h11L19 11H5z"/></svg>
                        </g>
                    );
                })}
            </svg>
            {hoveredDriver && hoveredDriver.position && (
                <div 
                    className="driver-map-tooltip"
                    style={{
                        left: `${mapCoordsToSvg(hoveredDriver.position.lat, hoveredDriver.position.lng).x}%`,
                        top: `${mapCoordsToSvg(hoveredDriver.position.lat, hoveredDriver.position.lng).y}%`
                    }}
                >
                    {hoveredDriver.name}
                </div>
            )}
            {onlineDrivers.length === 0 && (
                <div className="map-message">No drivers are currently online.</div>
            )}
        </div>
    );
  };

  const AdminDashboard = () => {
    const [newDriverName, setNewDriverName] = useState('');
    const [newDriverPhone, setNewDriverPhone] = useState('');
    const [newDriverUsername, setNewDriverUsername] = useState('');
    const [newDriverPassword, setNewDriverPassword] = useState('');
    const [newDriverAvatar, setNewDriverAvatar] = useState<string>(defaultAvatarSvg);
    const [driverError, setDriverError] = useState('');
    const [addVehicleType, setAddVehicleType] = useState('');
    const [newVehiclePlate, setNewVehiclePlate] = useState('');
    const [newVehicleModel, setNewVehicleModel] = useState('');
    const [vehicleError, setVehicleError] = useState('');
    const [currentMonth, setCurrentMonth] = useState(new Date());
    const [selectedDate, setSelectedDate] = useState<Date | null>(null);
    const [activeTab, setActiveTab] = useState('bookings'); // 'bookings', 'calendar', 'live', 'manage'
    const [bookingView, setBookingView] = useState('current'); // 'current', 'history'
    const [manageView, setManageView] = useState<'main' | 'drivers' | 'vehicles' | 'payment' | 'system'>('main');
    const [historyFilters, setHistoryFilters] = useState({ date: '', status: 'all', driver: 'all' });
    const [justAssigned, setJustAssigned] = useState<string | null>(null);
    const [justAddedItem, setJustAddedItem] = useState<{type: string, id: string} | null>(null);
    const [keyInput, setKeyInput] = useState(razorpayKey || '');
    const [systemStatus, setSystemStatus] = useState<{status: 'idle' | 'testing' | 'success' | 'error', message: string}>({status: 'idle', message: ''});


    useEffect(() => {
        setKeyInput(razorpayKey || '');
    }, [razorpayKey]);

    const handleFilterChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setHistoryFilters(prev => ({ ...prev, [name]: value }));
    };

    const localHandleAssignDriver = (bookingConfirmation: string, driverName: string, vehiclePlate: string) => {
        handleAssignDriver(bookingConfirmation, driverName, vehiclePlate);
        setJustAssigned(bookingConfirmation);
        setTimeout(() => setJustAssigned(null), 1500); // Animation duration
    };

    const handleFileRead = (file: File): Promise<string> => {
        return new Promise((resolve, reject) => {
            if (file.size > 2 * 1024 * 1024) { // 2MB limit
                reject(new Error("File size exceeds 2MB."));
                return;
            }
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    };
    
    const handleDriverAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>, username: string) => {
        if (e.target.files && e.target.files[0]) {
            try {
                const base64 = await handleFileRead(e.target.files[0]);
                setDrivers(prev => prev.map(d => d.username === username ? { ...d, avatar: base64 } : d));
                addNotification("Avatar updated successfully.", "success");
            } catch (error: any) {
                addNotification(`Error: ${error.message || "Failed to read file."}`, "error");
            }
        }
    };

    const handleNewDriverAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            try {
                const base64 = await handleFileRead(e.target.files[0]);
                setNewDriverAvatar(base64);
            } catch (error: any) {
                addNotification(`Error: ${error.message || "Failed to read file."}`, "error");
                setNewDriverAvatar(defaultAvatarSvg);
            }
        }
    };

    const handleTestAIService = async () => {
        setSystemStatus({ status: 'testing', message: 'Connecting to AI service...' });
        try {
            const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });
            await ai.models.generateContent({
                model: "gemini-2.5-flash",
                contents: "test",
            });
            setSystemStatus({ status: 'success', message: 'Connection successful. The AI service is responding correctly.' });
            addNotification('AI service connection is healthy.', 'success');
        } catch (error) {
            console.error("AI Service Test Failed:", error);
            setSystemStatus({ status: 'error', message: 'Connection failed. The AI service is not responding. Check backend configuration and API key validity.' });
            addNotification('Could not connect to the AI service.', 'error');
        }
    };

    const filteredBookings = useMemo(() => {
        let filtered = [...bookings];

        if (bookingView === 'current') {
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            // Show bookings that are today or in the future and are not cancelled
            return filtered.filter(b => {
                const bookingDate = new Date(b.date);
                return bookingDate >= today && b.bookingStatus !== 'cancelled';
            }).sort((a, b) => new Date(`${a.date}T${a.time}`).getTime() - new Date(`${b.date}T${b.time}`).getTime());
        }

        // History tab filtering
        if (historyFilters.date) {
            filtered = filtered.filter(b => b.date === historyFilters.date);
        }
        if (historyFilters.status !== 'all') {
            filtered = filtered.filter(b => b.bookingStatus === historyFilters.status);
        }
        if (historyFilters.driver !== 'all') {
            filtered = filtered.filter(b => b.driverName === historyFilters.driver);
        }
        
        return filtered.sort((a, b) => new Date(`${b.date}T${b.time}`).getTime() - new Date(`${a.date}T${a.time}`).getTime());

    }, [bookings, bookingView, historyFilters]);


    const handlePrevMonth = () => {
        setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1));
    };
    const handleNextMonth = () => {
        setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1));
    };

    const handleDayClick = (day: Date) => {
        const bookingsOnDay = bookings.filter(b => {
            if (!b.date || b.bookingStatus === 'cancelled') return false;
            const [year, month, dayOfMonth] = b.date.split('-').map(Number);
            const bookingDate = new Date(year, month - 1, dayOfMonth);
            return bookingDate.getFullYear() === day.getFullYear() &&
                   bookingDate.getMonth() === day.getMonth() &&
                   bookingDate.getDate() === day.getDate();
        });
        if (bookingsOnDay.length > 0) {
            setSelectedDate(day);
        }
    };

    const handleAddDriver = (e: React.FormEvent) => {
        e.preventDefault();
        if (!newDriverName || !newDriverPhone || !newDriverUsername || !newDriverPassword) {
            setDriverError('All fields are required.');
            return;
        }
        if (drivers.some(d => d.username === newDriverUsername)) {
            setDriverError('Username already exists.');
            return;
        }
        setDriverError('');
        const newDriver: Driver = { name: newDriverName, phone: newDriverPhone, username: newDriverUsername, password: newDriverPassword, status: 'online', avatar: newDriverAvatar };
        setDrivers(prev => [...prev, newDriver]);
        addNotification('New driver added successfully.', 'success');
        setJustAddedItem({type: 'driver', id: newDriverUsername});
        setTimeout(() => setJustAddedItem(null), 1000);
        setNewDriverName('');
        setNewDriverPhone('');
        setNewDriverUsername('');
        setNewDriverPassword('');
        setNewDriverAvatar(defaultAvatarSvg);
    };

    const handleRemoveDriver = (username: string) => {
        setDrivers(prev => prev.filter(d => d.username !== username));
        addNotification('Driver removed.', 'info');
    };

    const handleAddVehicle = (e: React.FormEvent, type: string) => {
        e.preventDefault();
        if (!newVehiclePlate || !newVehicleModel) {
            setVehicleError('Plate and model are required.');
            return;
        }
        setVehicleError('');
        const newVehicle: Vehicle = { plate: newVehiclePlate, model: newVehicleModel };
        const updatedTypes = { ...vehicleTypes };
        updatedTypes[type].vehicles.push(newVehicle);
        setVehicleTypes(updatedTypes);
        addNotification('New vehicle added.', 'success');
        setJustAddedItem({type: 'vehicle', id: newVehiclePlate});
        setTimeout(() => setJustAddedItem(null), 1000);
        setNewVehiclePlate('');
        setNewVehicleModel('');
    };

    const handleRemoveVehicle = (type: string, plate: string) => {
        const updatedTypes = { ...vehicleTypes };
        updatedTypes[type].vehicles = updatedTypes[type].vehicles.filter(v => v.plate !== plate);
        setVehicleTypes(updatedTypes);
        addNotification('Vehicle removed.', 'info');
    };

    const calendarDays = useMemo(() => {
        const year = currentMonth.getFullYear();
        const month = currentMonth.getMonth();

        const firstDayOfMonth = new Date(year, month, 1);
        const lastDayOfMonth = new Date(year, month + 1, 0);

        const daysInMonth = lastDayOfMonth.getDate();
        const startDayOfWeek = firstDayOfMonth.getDay(); // 0 = Sunday

        const days = [];

        // Add padding days from the previous month
        for (let i = 0; i < startDayOfWeek; i++) {
            days.push({ key: `pad-start-${i}`, type: 'padding' });
        }

        // Add days of the current month
        for (let day = 1; day <= daysInMonth; day++) {
            const date = new Date(year, month, day);
            const today = new Date();
            const isToday = date.getFullYear() === today.getFullYear() && date.getMonth() === today.getMonth() && date.getDate() === today.getDate();

            const bookingsOnDay = bookings.filter(b => {
                if (!b.date || b.bookingStatus === 'cancelled') return false;
                const [y, m, d] = b.date.split('-').map(Number);
                return y === year && (m - 1) === month && d === day;
            });

            days.push({
                key: `day-${day}`,
                type: 'day',
                date,
                dayOfMonth: day,
                isToday,
                bookings: bookingsOnDay
            });
        }
        
        // Add padding days for the next month
        const totalCells = days.length;
        const remainingCells = (7 - (totalCells % 7)) % 7;
        for (let i = 0; i < remainingCells; i++) {
            days.push({ key: `pad-end-${i}`, type: 'padding' });
        }

        return days;

    }, [currentMonth, bookings]);
    
    // FIX: Refactored from a render function to a proper component to fix invalid hook call error.
    // FIX: Explicitly typed AdminBookingItem as a React.FC to resolve a TypeScript error when passing the 'key' prop.
    const AdminBookingItem: React.FC<{ booking: Booking }> = ({ booking }) => {
        const isEditing = isEditingAssignment === booking.confirmationNumber;
        const [assignment, setAssignment] = useState({ driver: booking.driverName || '', vehicle: booking.assignedVehicle?.plate || '' });
        const [assignmentError, setAssignmentError] = useState('');
        const driverDetails = useMemo(() => drivers.find(d => d.name === booking.driverName), [drivers, booking.driverName]);
    
        useEffect(() => {
            if (isEditing) {
                setAssignment({ 
                    driver: booking.driverName || '', 
                    vehicle: booking.assignedVehicle?.plate || '' 
                });
                setAssignmentError('');
            }
        }, [isEditing, booking.driverName, booking.assignedVehicle]);

        const { allDriversWithStatus, allVehiclesWithStatus } = useMemo(() => {
            if (!isEditing) {
                return {
                    allDriversWithStatus: drivers.map(d => ({ ...d, conflict: undefined })),
                    allVehiclesWithStatus: [],
                };
            }
        
            const allOtherBookings = bookings.filter(b => 
                b.confirmationNumber !== booking.confirmationNumber && 
                b.bookingStatus !== 'cancelled'
            );
            
            const DURATION_MS = 90 * 60 * 1000;
            const getEndTime = (date: string, time: string): string => {
                try {
                    const start = new Date(`${date}T${time}`).getTime();
                    if (isNaN(start)) return '';
                    const end = new Date(start + DURATION_MS);
                    return end.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
                } catch (e) {
                    console.error("Error formatting time:", e);
                    return '';
                }
            };
        
            const driverConflicts = new Map<string, string>();
            const vehicleConflicts = new Map<string, string>();
        
            allOtherBookings.forEach(otherBooking => {
                if (isTimeOverlapping(booking, otherBooking)) {
                    if (otherBooking.driverName && !driverConflicts.has(otherBooking.driverName)) {
                        const endTime = getEndTime(otherBooking.date, otherBooking.time);
                        driverConflicts.set(otherBooking.driverName, `Booked ${otherBooking.time} - ${endTime}`);
                    }
                    if (otherBooking.assignedVehicle?.plate && !vehicleConflicts.has(otherBooking.assignedVehicle.plate)) {
                        const endTime = getEndTime(otherBooking.date, otherBooking.time);
                        vehicleConflicts.set(otherBooking.assignedVehicle.plate, `Booked ${otherBooking.time} - ${endTime}`);
                    }
                }
            });
            
            const allDriversWithStatus = drivers.map(d => ({
                ...d,
                isOffline: d.status === 'offline',
                conflict: driverConflicts.get(d.name)
            }));
        
            const allVehiclesForType = vehicleTypes[booking.vehicleType]?.vehicles || [];
            const allVehiclesWithStatus = allVehiclesForType.map(v => ({
                ...v,
                conflict: vehicleConflicts.get(v.plate)
            }));
        
            return { allDriversWithStatus, allVehiclesWithStatus };
        }, [isEditing, booking, bookings, drivers, vehicleTypes]);

        const handleSave = () => {
            setAssignmentError(''); // Reset error on each attempt

            if (!assignment.driver || !assignment.vehicle) {
                setAssignmentError("Please select both a driver and a vehicle.");
                return;
            }
            
            const selectedDriverDetails = drivers.find(d => d.name === assignment.driver);
            if (selectedDriverDetails?.status === 'offline') {
                const errorMessage = `Driver ${assignment.driver} is currently offline and cannot be assigned.`;
                setAssignmentError(errorMessage);
                addNotification(errorMessage, "error");
                return;
            }

            const driverIsBooked = bookings.some(b => 
                b.confirmationNumber !== booking.confirmationNumber &&
                b.driverName === assignment.driver &&
                b.bookingStatus !== 'cancelled' &&
                isTimeOverlapping(booking, b)
            );
            if (driverIsBooked) {
                const errorMessage = `Driver ${assignment.driver} has an overlapping booking.`;
                setAssignmentError(errorMessage);
                addNotification(errorMessage, "error");
                return;
            }
    
            const vehicleIsBooked = bookings.some(b => 
                b.confirmationNumber !== booking.confirmationNumber &&
                b.assignedVehicle?.plate === assignment.vehicle &&
                b.bookingStatus !== 'cancelled' &&
                isTimeOverlapping(booking, b)
            );
            if (vehicleIsBooked) {
                const errorMessage = `Vehicle ${assignment.vehicle} has an overlapping booking.`;
                setAssignmentError(errorMessage);
                addNotification(errorMessage, "error");
                return;
            }

            localHandleAssignDriver(booking.confirmationNumber, assignment.driver, assignment.vehicle);
        };
        
        return (
          <li key={booking.confirmationNumber} className={`booking-list-item admin-booking-item ${!booking.driverName && booking.bookingStatus !== 'cancelled' ? 'needs-attention' : ''} ${booking.bookingStatus === 'cancelled' ? 'cancelled' : ''} ${justAssigned === booking.confirmationNumber ? 'just-assigned' : ''}`}>
             <div className="booking-item-header">
                <div>
                    <strong>{booking.guestName}</strong>
                    <span>#{booking.confirmationNumber.slice(-4)}</span>
                </div>
                <div className="booking-header-badges">
                    <span className={`payment-status-badge ${booking.paymentStatus}`}>{booking.paymentStatus}</span>
                    {booking.bookingStatus === 'cancelled' ? 
                        <span className="status-badge cancelled">Cancelled</span> :
                        !booking.driverName && <span className="attention-badge">Needs Attention</span>
                    }
                </div>
            </div>

            <div className="booking-item-body">
                <div className="booking-item-row">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8 6h13"/><path d="M8 12h13"/><path d="M8 18h13"/><path d="M3 6h.01"/><path d="M3 12h.01"/><path d="M3 18h.01"/></svg>
                    <div>
                        <span>{booking.date} @ {booking.time}</span>
                        <small>{booking.location}</small>
                    </div>
                </div>
                 <div className="booking-item-row">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                    <div>
                        <span>{booking.vehicleType}</span>
                        <small>{booking.guestPhone}</small>
                    </div>
                </div>
            </div>

            {booking.bookingStatus === 'cancelled' ? (
                <p className="cancelled-message">This booking was cancelled.</p>
            ) : isEditing ? (
              <div className="driver-assignment-form">
                <div className="assignment-input-group">
                  <label>Assign Driver</label>
                  <select value={assignment.driver} onChange={e => setAssignment({...assignment, driver: e.target.value})}>
                    <option value="">Select Driver</option>
                    <optgroup label="Available">
                        {allDriversWithStatus.filter(d => !d.conflict && !d.isOffline).map(d => <option key={d.username} value={d.name}>{d.name}</option>)}
                    </optgroup>
                    <optgroup label="Unavailable (Overlapping)">
                        {allDriversWithStatus.filter(d => d.conflict).map(d => (
                            <option key={d.username} value={d.name} disabled>
                                {d.name} ({d.conflict})
                            </option>
                        ))}
                    </optgroup>
                    <optgroup label="Offline">
                        {allDriversWithStatus.filter(d => d.isOffline && !d.conflict).map(d => (
                            <option key={d.username} value={d.name} disabled>
                                {d.name} (Offline)
                            </option>
                        ))}
                    </optgroup>
                  </select>
                </div>
                <div className="assignment-input-group">
                  <label>Assign Vehicle</label>
                  <select value={assignment.vehicle} onChange={e => setAssignment({...assignment, vehicle: e.target.value})}>
                    <option value="">Select Vehicle</option>
                    <optgroup label="Available">
                        {allVehiclesWithStatus.filter(v => !v.conflict).map(v => <option key={v.plate} value={v.plate}>{v.model} ({v.plate})</option>)}
                    </optgroup>
                    <optgroup label="Unavailable (Overlapping)">
                        {allVehiclesWithStatus.filter(v => v.conflict).map(v => (
                            <option key={v.plate} value={v.plate} disabled>
                                {v.model} ({v.plate}) - {v.conflict}
                            </option>
                        ))}
                    </optgroup>
                  </select>
                </div>
                {assignmentError && <p className="assignment-error">{assignmentError}</p>}
                <div className="assignment-actions">
                    <button className="assign-btn cancel" onClick={() => setIsEditingAssignment(null)}>Cancel</button>
                    <button className="assign-btn save" onClick={handleSave}>Save</button>
                </div>
              </div>
            ) : (
                <div className="driver-assignment-display">
                    <div className="assignment-details">
                       <div className="assignment-detail-row">
                            {driverDetails ? (
                                <img src={driverDetails.avatar || defaultAvatarSvg} alt="" className="avatar-img avatar-sm" />
                            ) : (
                                <div className="avatar-placeholder avatar-sm" />
                            )}
                            <p><strong>Driver:</strong> {booking.driverName || 'Unassigned'}</p>
                        </div>
                         <div className="assignment-detail-row">
                            <p><strong>Vehicle:</strong> {booking.assignedVehicle?.plate || 'Unassigned'}</p>
                        </div>
                    </div>
                    <div className="assignment-button-group">
                        <button className="assign-btn" onClick={() => setIsEditingAssignment(booking.confirmationNumber)}>
                            {booking.driverName ? 'Re-assign' : 'Assign'}
                        </button>
                        <button 
                            className="assign-btn cancel-action" 
                            onClick={() => {
                                if (window.confirm('Are you sure you want to cancel this booking?')) {
                                    handleCancelBooking(booking.confirmationNumber);
                                }
                            }}
                        >
                            Cancel
                        </button>
                    </div>
                </div>
            )}
          </li>
        );
    };

    const renderCalendarModal = () => {
        if (!selectedDate) return null;

        const bookingsOnSelectedDate = bookings.filter(b => {
            if (!b.date || b.bookingStatus === 'cancelled') return false;
            const [year, month, dayOfMonth] = b.date.split('-').map(Number);
            const bookingDate = new Date(year, month - 1, dayOfMonth);
            return bookingDate.getFullYear() === selectedDate.getFullYear() &&
                   bookingDate.getMonth() === selectedDate.getMonth() &&
                   bookingDate.getDate() === selectedDate.getDate();
        }).sort((a, b) => a.time.localeCompare(b.time));

        return (
            <div className="modal-overlay" onClick={() => setSelectedDate(null)}>
                <div className="modal-content" onClick={e => e.stopPropagation()}>
                    <h2>Bookings for {selectedDate.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</h2>
                    <ul className="calendar-modal-booking-list">
                        {bookingsOnSelectedDate.map(b => (
                            <li key={b.confirmationNumber}>
                                <div className="booking-time">{b.time}</div>
                                <div className="booking-info">
                                    <strong>{b.guestName}</strong>
                                    <span>{b.location}</span>
                                    <span>Driver: {b.driverName || 'Unassigned'}</span>
                                    <span>Vehicle: {b.assignedVehicle ? `${b.assignedVehicle.model} (${b.assignedVehicle.plate})` : 'Unassigned'}</span>
                                </div>
                            </li>
                        ))}
                    </ul>
                    <button className="primary-btn" onClick={() => setSelectedDate(null)}>Close</button>
                </div>
            </div>
        );
    };

    const renderMobileCalendar = () => {
        const upcomingBookings = bookings
            .filter(b => new Date(b.date) >= new Date(new Date().setHours(0,0,0,0)) && b.bookingStatus !== 'cancelled')
            .sort((a,b) => new Date(`${a.date}T${a.time}`).getTime() - new Date(`${b.date}T${b.time}`).getTime());

        // FIX: Explicitly type the accumulator in the `reduce` function to prevent
        // incorrect type inference that was causing `groupedByDate` to have a weak
        // type, leading to a downstream error where `bookingsOnDate.map` failed.
        const groupedByDate = upcomingBookings.reduce((acc: Record<string, Booking[]>, booking) => {
            const date = booking.date;
            if (!acc[date]) {
                acc[date] = [];
            }
            acc[date].push(booking);
            return acc;
        }, {} as Record<string, Booking[]>);

        return (
            <div className="calendar-agenda-view">
                <h3>Upcoming Schedule</h3>
                {Object.keys(groupedByDate).length > 0 ? (
                    Object.entries(groupedByDate).map(([date, bookingsOnDate]) => (
                        <div key={date} className="agenda-day-group">
                            <h4 className="agenda-date-header">
                                {new Date(date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
                            </h4>
                            <ul className="agenda-booking-list">
                                {bookingsOnDate.map(booking => (
                                    <li key={booking.confirmationNumber} className="agenda-booking-item">
                                        <div className="agenda-booking-time">{booking.time}</div>
                                        <div className="agenda-booking-details">
                                            <strong>{booking.guestName}</strong>
                                            <span>To/From: {booking.location}</span>
                                            <small>Driver: {booking.driverName || 'Unassigned'}</small>
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    ))
                ) : (
                    <p className="no-bookings-message">No upcoming bookings.</p>
                )}
            </div>
        )
    }

    return (
        <div className="dashboard-container">
            <div className="dashboard-header">
                <h2>Admin Dashboard</h2>
                <button className="logout-btn" onClick={handleLogout}>Logout</button>
            </div>
            <main className="dashboard-content">
                 <div className="dashboard-tabs">
                    <button className={`tab-btn ${activeTab === 'bookings' && bookingView === 'current' ? 'active' : ''}`} onClick={() => { setActiveTab('bookings'); setBookingView('current'); }}>Current Bookings</button>
                    <button className={`tab-btn ${activeTab === 'bookings' && bookingView === 'history' ? 'active' : ''}`} onClick={() => { setActiveTab('bookings'); setBookingView('history'); }}>Booking History</button>
                    <button className={`tab-btn ${activeTab === 'calendar' ? 'active' : ''}`} onClick={() => setActiveTab('calendar')}>Calendar View</button>
                    <button className={`tab-btn ${activeTab === 'live' ? 'active' : ''}`} onClick={() => setActiveTab('live')}>Live Map</button>
                    <button className={`tab-btn ${activeTab === 'manage' ? 'active' : ''}`} onClick={() => setActiveTab('manage')}>Manage</button>
                </div>

                {activeTab === 'bookings' && (
                     <section key="bookings" className="view-enter-active">
                        <h3>{bookingView === 'current' ? 'Upcoming & Active Bookings' : 'Booking History'}</h3>
                        {bookingView === 'history' && (
                            <div className="history-filters">
                                <input type="date" name="date" value={historyFilters.date} onChange={handleFilterChange} />
                                <select name="status" value={historyFilters.status} onChange={handleFilterChange}>
                                    <option value="all">All Statuses</option>
                                    <option value="confirmed">Confirmed</option>
                                    <option value="assigned">Assigned</option>
                                    <option value="cancelled">Cancelled</option>
                                </select>
                                <select name="driver" value={historyFilters.driver} onChange={handleFilterChange}>
                                    <option value="all">All Drivers</option>
                                    {drivers.map(d => <option key={d.username} value={d.name}>{d.name}</option>)}
                                </select>
                            </div>
                        )}
                        {filteredBookings.length > 0 ? (
                            <ul className="booking-list">
                                {filteredBookings.map(booking => <AdminBookingItem key={booking.confirmationNumber} booking={booking} />)}
                            </ul>
                        ) : (
                            <p className="no-bookings-message">No bookings found.</p>
                        )}
                    </section>
                )}
               
                {activeTab === 'calendar' && (
                    <section key="calendar" className="calendar-section view-enter-active">
                        <div className="desktop-only">
                            <h3>Calendar View</h3>
                            <div className="calendar-container">
                                <div className="calendar-header">
                                    <button onClick={handlePrevMonth}>&larr;</button>
                                    <h2>{currentMonth.toLocaleString('default', { month: 'long', year: 'numeric' })}</h2>
                                    <button onClick={handleNextMonth}>&rarr;</button>
                                </div>
                                <div className="calendar-grid weekdays">
                                    {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => <div key={day}>{day}</div>)}
                                </div>
                                <div className="calendar-grid days">
                                    {calendarDays.map(dayInfo => {
                                        if (dayInfo.type === 'padding') {
                                            return <div key={dayInfo.key} className="calendar-day other-month"></div>;
                                        }
                                        const { key, date, dayOfMonth, isToday, bookings } = dayInfo;
                                        const hasBookings = bookings.length > 0;
                                        return (
                                            <div 
                                                key={key} 
                                                className={`calendar-day ${isToday ? 'is-today' : ''} ${hasBookings ? 'has-bookings' : ''}`}
                                                onClick={() => handleDayClick(date)}
                                            >
                                                <span>{dayOfMonth}</span>
                                                {hasBookings && <div className="booking-indicator">{bookings.length}</div>}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                        <div className="mobile-only">
                            {renderMobileCalendar()}
                        </div>
                    </section>
                )}

                {activeTab === 'live' && (
                    <section key="live" className="view-enter-active">
                        <h3>Live Driver Locations</h3>
                        <LiveMapComponent drivers={drivers} />
                    </section>
                )}

                {activeTab === 'manage' && (
                     <section key="manage" className="management-section-container view-enter-active">
                        {manageView === 'main' ? (
                            <>
                                <h3>Management</h3>
                                <ul className="manage-menu-list">
                                    <li className="manage-menu-item" onClick={() => setManageView('drivers')}>
                                        <span>Manage Drivers</span>
                                        <span>&rarr;</span>
                                    </li>
                                    <li className="manage-menu-item" onClick={() => setManageView('vehicles')}>
                                        <span>Manage Vehicles</span>
                                        <span>&rarr;</span>
                                    </li>
                                    <li className="manage-menu-item" onClick={() => setManageView('payment')}>
                                        <span>Payment Gateway</span>
                                        <span>&rarr;</span>
                                    </li>
                                    <li className="manage-menu-item" onClick={() => setManageView('system')}>
                                        <span>System Status</span>
                                        <span>&rarr;</span>
                                    </li>
                                </ul>
                            </>
                        ) : (
                        <div className="management-grid">
                          <div className={`management-section ${manageView !== 'main' ? 'full-span' : ''}`}>
                             <button className="mobile-back-button" onClick={() => setManageView('main')}>&larr; Back to Management</button>
                             {manageView === 'drivers' && (
                                <>
                                 <h3>Manage Drivers</h3>
                                 <ul className="item-list">
                                     {drivers.map(d => (
                                         <li key={d.username} className={justAddedItem?.type === 'driver' && justAddedItem?.id === d.username ? 'new-item-flash' : ''}>
                                             <div className="driver-info">
                                                 <div className="avatar-upload-wrapper">
                                                     <img src={d.avatar || defaultAvatarSvg} alt={`${d.name}'s avatar`} className="avatar-img avatar-md" />
                                                     <label htmlFor={`avatar-upload-${d.username}`} className="avatar-edit-trigger">
                                                         <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2H3a2 2 0 0 0-2 2v12c0 1.1.9 2 2 2h3.5"/><path d="m15.5 8.5 3 3L11 19H8v-3l7.5-7.5z"/></svg>
                                                     </label>
                                                     <input
                                                         type="file"
                                                         id={`avatar-upload-${d.username}`}
                                                         className="avatar-file-input"
                                                         accept="image/png, image/jpeg, image/webp"
                                                         onChange={(e) => handleDriverAvatarChange(e, d.username)}
                                                     />
                                                 </div>
                                                 <div>
                                                     <span><span className={`driver-status-dot ${d.status}`}></span><strong>{d.name}</strong></span>
                                                     <small className="driver-username">@{d.username}</small>
                                                 </div>
                                             </div>
                                             <button onClick={() => handleRemoveDriver(d.username)} className="remove-item-btn">&times;</button>
                                         </li>
                                     ))}
                                 </ul>
                                 <form onSubmit={handleAddDriver} className="add-item-form-grid">
                                     <div className="add-driver-avatar-section">
                                         <img src={newDriverAvatar} alt="New driver avatar preview" className="avatar-img avatar-lg" />
                                         <label htmlFor="new-driver-avatar-upload" className="secondary-btn">Upload Avatar</label>
                                         <input type="file" id="new-driver-avatar-upload" className="avatar-file-input" accept="image/png, image/jpeg, image/webp" onChange={handleNewDriverAvatarChange} />
                                     </div>
                                     <input type="text" placeholder="Full Name" value={newDriverName} onChange={e => setNewDriverName(e.target.value)} />
                                     <input type="tel" placeholder="Phone" value={newDriverPhone} onChange={e => setNewDriverPhone(e.target.value)} />
                                     <input type="text" placeholder="Username" value={newDriverUsername} onChange={e => setNewDriverUsername(e.target.value)} />
                                     <input type="password" placeholder="Password" value={newDriverPassword} onChange={e => setNewDriverPassword(e.target.value)} />
                                     {driverError && <p className="form-error">{driverError}</p>}
                                     <button type="submit" className="add-item-btn">Add Driver</button>
                                 </form>
                                </>
                             )}
                              {manageView === 'vehicles' && (
                                 <>
                                     <h3>Manage Vehicles</h3>
                                     {Object.keys(vehicleTypes).map(type => (
                                         <div key={type} className="vehicle-type-group">
                                             <h4>{type}</h4>
                                             <ul className="item-list nested">
                                                 {vehicleTypes[type].vehicles.map(v => (
                                                     <li key={v.plate} className={justAddedItem?.type === 'vehicle' && justAddedItem?.id === v.plate ? 'new-item-flash' : ''}>
                                                         <span><strong>{v.model}</strong></span>
                                                         <span>{v.plate} <button onClick={() => handleRemoveVehicle(type, v.plate)} className="remove-item-btn">&times;</button></span>
                                                     </li>
                                                 ))}
                                             </ul>
                                             <form onSubmit={(e) => handleAddVehicle(e, type)} className="add-item-form-grid">
                                                 <input type="text" placeholder="Vehicle Plate" value={newVehiclePlate} onChange={e => setNewVehiclePlate(e.target.value)} onClick={() => setAddVehicleType(type)}/>
                                                 <input type="text" placeholder="Vehicle Model" value={newVehicleModel} onChange={e => setNewVehicleModel(e.target.value)} onClick={() => setAddVehicleType(type)}/>
                                                 {vehicleError && addVehicleType === type && <p className="form-error">{vehicleError}</p>}
                                                 <button type="submit" className="add-item-btn-secondary" onClick={() => setAddVehicleType(type)}>Add to {type}</button>
                                             </form>
                                         </div>
                                     ))}
                                 </>
                             )}
                              {manageView === 'payment' && (
                                 <>
                                     <h3>Payment Gateway Configuration</h3>
                                     <form className="payment-config-form" onSubmit={(e) => { e.preventDefault(); handleSaveRazorpayKey(keyInput); }}>
                                         <input 
                                             type="text" 
                                             placeholder="Enter your Razorpay Key ID" 
                                             value={keyInput}
                                             onChange={(e) => setKeyInput(e.target.value)}
                                         />
                                         <button type="submit" className="assign-btn save">Save Key</button>
                                     </form>
                                     {!razorpayKey && <p className="config-warning">No API key set. Online payments are currently disabled.</p>}
                                 </>
                             )}
                             {manageView === 'system' && (
                                <>
                                    <h3>System Status</h3>
                                    <div className="system-status-container">
                                        <p>Test the connection to the generative AI service. This ensures that features like location suggestions and booking confirmations are operational.</p>
                                        <button 
                                            onClick={handleTestAIService} 
                                            disabled={systemStatus.status === 'testing'}
                                            className="secondary-btn"
                                        >
                                            {systemStatus.status === 'testing' ? 'Testing...' : 'Run Connection Test'}
                                        </button>
                                        {systemStatus.status !== 'idle' && (
                                            <div className={`system-status-result ${systemStatus.status}`}>
                                                {systemStatus.message}
                                            </div>
                                        )}
                                    </div>
                                </>
                             )}
                          </div>
                        </div>
                     )}
                    </section>
                )}
            </main>
            {renderCalendarModal()}
            <nav className="admin-mobile-nav">
                <button className={`mobile-nav-btn ${activeTab === 'bookings' ? 'active' : ''}`} onClick={() => setActiveTab('bookings')}>
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8 6h13"/><path d="M8 12h13"/><path d="M8 18h13"/><path d="M3 6h.01"/><path d="M3 12h.01"/><path d="M3 18h.01"/></svg>
                    <span>Bookings</span>
                </button>
                <button className={`mobile-nav-btn ${activeTab === 'calendar' ? 'active' : ''}`} onClick={() => setActiveTab('calendar')}>
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                    <span>Calendar</span>
                </button>
                <button className={`mobile-nav-btn ${activeTab === 'live' ? 'active' : ''}`} onClick={() => setActiveTab('live')}>
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>
                    <span>Live Map</span>
                </button>
                <button className={`mobile-nav-btn ${activeTab === 'manage' ? 'active' : ''}`} onClick={() => { setActiveTab('manage'); setManageView('main'); }}>
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line><line x1="8" y1="18" x2="21" y2="18"></line><line x1="3" y1="6" x2="3.01" y2="6"></line><line x1="3" y1="12" x2="3.01" y2="12"></line><line x1="3" y1="18" x2="3.01" y2="18"></line></svg>
                    <span>Manage</span>
                </button>
            </nav>
        </div>
    );
  };
  
  const DriverDashboard = () => {
    if (!loggedInDriver) return null;
    
    const watchIdRef = useRef<number | null>(null);
    const driverDetails = useMemo(() => drivers.find(d => d.username === loggedInDriver.username), [drivers, loggedInDriver.username]);
    const isOnline = driverDetails?.status === 'online';

    const [activeTab, setActiveTab] = useState('current'); // 'current', 'history'
    const [historyFilters, setHistoryFilters] = useState({ date: '', status: 'all' });
    
    const stopWatchingPosition = () => {
        if (watchIdRef.current !== null) {
            navigator.geolocation.clearWatch(watchIdRef.current);
            watchIdRef.current = null;
        }
    };

    const handleToggleOnlineStatus = () => {
        const newStatus = isOnline ? 'offline' : 'online';
        
        if (newStatus === 'online') {
            if (!navigator.geolocation) {
                addNotification("Geolocation is not supported by your browser.", "error");
                return;
            }

            watchIdRef.current = navigator.geolocation.watchPosition(
                (position) => {
                    const { latitude, longitude } = position.coords;
                    setDrivers(prev => prev.map(d => 
                        d.username === loggedInDriver.username ? { ...d, status: 'online', position: { lat: latitude, lng: longitude } } : d
                    ));
                    if (watchIdRef.current === null) { // This check might be flawed due to async nature.
                        addNotification("You are now online and your location is being shared.", "success");
                    }
                },
                (error) => {
                    if (error.code === error.PERMISSION_DENIED) {
                        addNotification("Location access is required to go online. Please enable it in your browser settings.", "error");
                    } else {
                        addNotification("Could not get your location. Please try again.", "error");
                    }
                    // Force back to offline
                    setDrivers(prev => prev.map(d => 
                        d.username === loggedInDriver.username ? { ...d, status: 'offline', position: undefined } : d
                    ));
                },
                { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
            );
            // This notification will fire immediately upon trying to go online.
            addNotification("You are now online and your location is being shared.", "success");

        } else { // Going offline
            stopWatchingPosition();
            setDrivers(prev => prev.map(d => 
                d.username === loggedInDriver.username ? { ...d, status: 'offline', position: undefined } : d
            ));
            addNotification("You are now offline.", "info");
        }
    };

    const handleFilterChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setHistoryFilters(prev => ({ ...prev, [name]: value }));
    };

    const driverBookings = useMemo(() => {
        return bookings.filter(b => b.driverName === loggedInDriver.name);
    }, [bookings, loggedInDriver]);

    const filteredBookings = useMemo(() => {
        let filtered = [...driverBookings];

        if (activeTab === 'current') {
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            return filtered.filter(b => {
                const bookingDate = new Date(b.date);
                return bookingDate >= today && b.bookingStatus !== 'cancelled';
            }).sort((a, b) => new Date(`${a.date}T${a.time}`).getTime() - new Date(`${b.date}T${b.time}`).getTime());
        }

        // History tab filtering
        if (historyFilters.date) {
            filtered = filtered.filter(b => b.date === historyFilters.date);
        }
        if (historyFilters.status !== 'all') {
            filtered = filtered.filter(b => b.bookingStatus === historyFilters.status);
        }
        
        return filtered.sort((a, b) => new Date(`${b.date}T${b.time}`).getTime() - new Date(`${a.date}T${a.time}`).getTime());

    }, [driverBookings, activeTab, historyFilters]);


    useEffect(() => {
      setBookings(prev => prev.map(b => {
        if (b.driverName === loggedInDriver.name && b.driverStatus !== 'arrived') {
            return { ...b, driverStatus: isOnline ? 'online' : 'offline' };
        }
        return b;
      }));
    }, [isOnline, loggedInDriver.name]);

    useEffect(() => {
        // Cleanup on component unmount (logout)
        return () => {
            stopWatchingPosition();
        };
    }, []);

    useEffect(() => {
        driverBookings.forEach(booking => {
            if (isOnline && !intervalRefs.current[booking.confirmationNumber] && booking.driverStatus !== 'arrived') {
                const startTime = Date.now();
                const duration = 20000; // 20 seconds simulation
                const startPos = { x: 15, y: 50 };
                const endPos = { x: 85, y: 50 };

                intervalRefs.current[booking.confirmationNumber] = window.setInterval(() => {
                    const progress = Math.min((Date.now() - startTime) / duration, 1);
                    const newPosition = {
                        x: startPos.x + (endPos.x - startPos.x) * progress,
                        y: startPos.y + (endPos.y - startPos.y) * progress,
                    };
                    const driverStatus = progress < 1 ? 'online' : 'arrived';
                    const eta = calculateSimulatedETA(progress);


                    setBookings(prev => prev.map(b => 
                        b.confirmationNumber === booking.confirmationNumber 
                        ? { ...b, driverPosition: newPosition, driverStatus, eta } 
                        : b
                    ));

                    if (progress >= 1) {
                        clearInterval(intervalRefs.current[booking.confirmationNumber]);
                        delete intervalRefs.current[booking.confirmationNumber];
                        addNotification(`You have arrived for booking #${booking.confirmationNumber.slice(-4)}.`, 'success');
                    }
                }, 1000);
            } else if (!isOnline && intervalRefs.current[booking.confirmationNumber]) {
                clearInterval(intervalRefs.current[booking.confirmationNumber]);
                delete intervalRefs.current[booking.confirmationNumber];
            }
        });

        return () => {
            Object.values(intervalRefs.current).forEach(clearInterval);
            intervalRefs.current = {};
        };
    }, [driverBookings, isOnline]);
  
    const renderDriverBookingItem = (booking: Booking) => {
      return (
        <li key={booking.confirmationNumber} className="booking-list-item">
          <div className="booking-item-header">
            <div>
              <strong>{booking.guestName}</strong>
              <span className={`payment-status-badge ${booking.paymentStatus}`}>{booking.paymentStatus}</span>
            </div>
            <span className={`status-indicator ${booking.driverStatus || 'unassigned'}`}>
                {booking.driverStatus}
            </span>
          </div>
          <div className="booking-item-body">
              <div className="booking-item-row">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8 6h13"/><path d="M8 12h13"/><path d="M8 18h13"/><path d="M3 6h.01"/><path d="M3 12h.01"/><path d="M3 18h.01"/></svg>
                    <div>
                        <span>{booking.date} @ {booking.time}</span>
                        <small>{booking.location}</small>
                    </div>
                </div>
                 <div className="booking-item-row">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                    <div>
                        <span>{booking.assignedVehicle?.model} ({booking.assignedVehicle?.plate})</span>
                        <small>{booking.guestPhone}</small>
                    </div>
                </div>
                <div className="booking-item-row">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                     <div>
                        <span>Pickup ETA</span>
                        <small>{booking.eta || booking.estimatedArrivalTime || 'N/A'}</small>
                    </div>
                </div>
          </div>
        </li>
      );
    };

    return (
      <div className="dashboard-container">
        <div className="dashboard-header">
            <div className="driver-welcome">
                <img src={driverDetails?.avatar || defaultAvatarSvg} alt="Your avatar" className="avatar-img avatar-lg" />
                <h2>Welcome, {loggedInDriver.name}</h2>
            </div>
          <button className="logout-btn" onClick={handleLogout}>Logout</button>
        </div>
        <main className="dashboard-content">
          <div className="driver-status-toggle">
            <span>Your Status</span>
            <label className="switch">
              <input type="checkbox" checked={isOnline} onChange={handleToggleOnlineStatus} />
              <span className="slider round"></span>
            </label>
          </div>
          <div className="dashboard-tabs">
            <button className={`tab-btn ${activeTab === 'current' ? 'active' : ''}`} onClick={() => setActiveTab('current')}>Current Assignments</button>
            <button className={`tab-btn ${activeTab === 'history' ? 'active' : ''}`} onClick={() => setActiveTab('history')}>Trip History</button>
          </div>

          {activeTab === 'current' && (
             <section key="current" className="view-enter-active">
                <h3>Your Active Bookings</h3>
                {filteredBookings.length > 0 ? (
                  <ul className="booking-list">
                    {filteredBookings.map(renderDriverBookingItem)}
                  </ul>
                ) : (
                  <p className="no-bookings-message">You have no active bookings.</p>
                )}
            </section>
          )}

          {activeTab === 'history' && (
             <section key="history" className="view-enter-active">
                <h3>Your Trip History</h3>
                <div className="history-filters">
                    <input type="date" name="date" value={historyFilters.date} onChange={handleFilterChange} />
                    <select name="status" value={historyFilters.status} onChange={handleFilterChange}>
                        <option value="all">All Statuses</option>
                        <option value="assigned">Completed</option>
                        <option value="cancelled">Cancelled</option>
                    </select>
                </div>
                {filteredBookings.length > 0 ? (
                  <ul className="booking-list">
                    {filteredBookings.map(renderDriverBookingItem)}
                  </ul>
                ) : (
                  <p className="no-bookings-message">No trips match the selected filters.</p>
                )}
            </section>
          )}

        </main>
      </div>
    );
  };

  const GuestBookingStatus = () => {
    const [historyFilters, setHistoryFilters] = useState({ date: '', status: 'all' });
    const [activeTab, setActiveTab] = useState('upcoming'); // 'upcoming', 'history'
    const assignedDriver = useMemo(() => drivers.find(d => d.name === selectedBooking?.driverName), [drivers, selectedBooking]);

    const handleFilterChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setHistoryFilters(prev => ({ ...prev, [name]: value }));
    };

    const { upcomingBookings, pastBookings } = useMemo(() => {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const upcoming = guestBookings.filter(b => {
            const bookingDate = new Date(b.date);
            return bookingDate >= today && b.bookingStatus !== 'cancelled';
        }).sort((a, b) => new Date(`${a.date}T${a.time}`).getTime() - new Date(`${b.date}T${a.time}`).getTime());
        
        let past = guestBookings.filter(b => {
            const bookingDate = new Date(b.date);
            // Include cancelled bookings of any date in history
            return bookingDate < today || b.bookingStatus === 'cancelled';
        });

        // Apply filters only to past bookings
        if (historyFilters.date) {
            past = past.filter(b => b.date === historyFilters.date);
        }
        if (historyFilters.status !== 'all') {
            past = past.filter(b => b.bookingStatus === historyFilters.status);
        }

        past.sort((a, b) => new Date(`${b.date}T${b.time}`).getTime() - new Date(`${a.date}T${a.time}`).getTime());

        return { upcomingBookings: upcoming, pastBookings: past };
    }, [guestBookings, historyFilters]);

    useEffect(() => {
        return () => {
            Object.values(intervalRefs.current).forEach(clearInterval);
            intervalRefs.current = {};
        };
    }, []);

    useEffect(() => {
        Object.values(intervalRefs.current).forEach(clearInterval);
        intervalRefs.current = {};
        
        const booking = selectedBooking;

        if (booking && booking.driverName && booking.driverStatus !== 'arrived' && !intervalRefs.current[booking.confirmationNumber]) {
            const startTime = Date.now();
            const duration = 20000;
            const startPos = { x: 15, y: 50 };
            const endPos = { x: 85, y: 50 };

            intervalRefs.current[booking.confirmationNumber] = window.setInterval(() => {
                const progress = Math.min((Date.now() - startTime) / duration, 1);
                const newPosition = {
                    x: startPos.x + (endPos.x - startPos.x) * progress,
                    y: startPos.y + (endPos.y - startPos.y) * progress,
                };
                
                const driverStatus = progress < 1 ? 'online' : 'arrived';
                const eta = calculateSimulatedETA(progress);

                const updatedBooking = { ...booking, driverPosition: newPosition, driverStatus, eta };

                setGuestBookings(prev => prev.map(b => 
                    b.confirmationNumber === booking.confirmationNumber 
                    ? updatedBooking
                    : b
                ));
                setSelectedBooking(prev => prev ? updatedBooking : null);

                if (progress >= 1) {
                    clearInterval(intervalRefs.current[booking.confirmationNumber]);
                    delete intervalRefs.current[booking.confirmationNumber];
                    addNotification(`Driver for booking #${booking.confirmationNumber.slice(-4)} has arrived.`, 'success');
                }
            }, 1000);
        }
    }, [selectedBooking]);

    const renderGuestBookingListItem = (booking: Booking) => (
        <li key={booking.confirmationNumber} className="booking-list-item guest-history-item" onClick={() => setSelectedBooking(booking)}>
            <div className="booking-item-header">
                <strong>{booking.location}</strong>
                <span className={`status-badge ${booking.bookingStatus}`}>{booking.bookingStatus}</span>
            </div>
            <div className="booking-item-body">
                 <div className="booking-item-row">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                    <div>
                        <span>{booking.date} @ {booking.time}</span>
                    </div>
                </div>
                 <div className="booking-item-row">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>
                     <div>
                        <span>Driver: {booking.driverName || 'Unassigned'}</span>
                    </div>
                </div>
            </div>
        </li>
    );

    return (
        <div className={`tracking-prompt-container ${selectedBooking ? 'detail-view-active' : ''} ${selectedBooking?.bookingStatus === 'cancelled' ? 'cancelled-view' : ''} view-enter-active`}>
            <button className="back-button" onClick={handleLogout}>&larr; Back to Booking</button>
            
            {guestBookings.length > 0 ? (
                selectedBooking ? (
                    <>
                        <button className="back-button list-view" onClick={() => setSelectedBooking(null)}>
                            &larr; View All Bookings
                        </button>
                        <h2>Booking Status</h2>
                        <p>Status for booking #{selectedBooking.confirmationNumber.slice(-4)}</p>
                        
                        <InteractiveMap booking={selectedBooking} />
                        
                        <div className="details-grid">
                            <div className="details-grid-item driver-detail">
                                <span className="detail-label">Driver</span>
                                <div className="detail-value">
                                    {assignedDriver ? (
                                        <img src={assignedDriver.avatar || defaultAvatarSvg} alt="Driver avatar" className="avatar-img avatar-md" />
                                    ) : (
                                        <div className="avatar-placeholder avatar-md" />
                                    )}
                                    <span>{selectedBooking.driverName || 'Pending'}</span>
                                </div>
                            </div>
                             <div className="details-grid-item">
                                <span className="detail-label">Vehicle</span>
                                <span className="detail-value">{selectedBooking.assignedVehicle?.model || 'Pending'}</span>
                            </div>
                            <div className="details-grid-item">
                                <span className="detail-label">Driver Contact</span>
                                <span className="detail-value">{selectedBooking.driverPhone || 'N/A'}</span>
                            </div>
                             <div className="details-grid-item">
                                <span className="detail-label">Plate #</span>
                                <span className="detail-value">{selectedBooking.assignedVehicle?.plate || 'N/A'}</span>
                            </div>
                             <div className="details-grid-item">
                                <span className="detail-label">ETA</span>
                                <span className="detail-value">{selectedBooking.eta || selectedBooking.estimatedArrivalTime || 'Calculating...'}</span>
                            </div>
                             <div className="details-grid-item">
                                <span className="detail-label">Ride Status</span>
                                <div className="detail-value">
                                    {selectedBooking.bookingStatus === 'cancelled' ?
                                        <span className="status-badge cancelled">Cancelled</span> :
                                        <span className={`status-indicator ${selectedBooking.driverStatus || 'unassigned'}`}>
                                            {selectedBooking.driverStatus || 'Unassigned'}
                                        </span>
                                    }
                                </div>
                            </div>
                             <div className="details-grid-item full-width">
                                <span className="detail-label">Payment</span>
                                <div className="detail-value">
                                    <span className={`payment-status-badge ${selectedBooking.paymentStatus}`}>
                                        {selectedBooking.paymentStatus}
                                    </span>
                                </div>
                            </div>
                        </div>


                        {selectedBooking.paymentStatus === 'pending' && selectedBooking.bookingStatus !== 'cancelled' && (
                            <button 
                                className="primary-btn pay-btn" 
                                onClick={() => handlePayment(selectedBooking)}
                                disabled={!razorpayKey}
                                title={!razorpayKey ? 'Online payments are currently unavailable' : ''}
                            >
                                Pay Now (₹{selectedBooking.estimatedFare})
                            </button>
                        )}
                        
                        <button 
                            className="primary-btn cancel-booking-btn" 
                            onClick={() => {
                                if (selectedBooking.bookingStatus !== 'cancelled' && window.confirm('Are you sure you want to cancel this booking? This action cannot be undone.')) {
                                    handleCancelBooking(selectedBooking.confirmationNumber);
                                }
                            }}
                            disabled={selectedBooking.bookingStatus === 'cancelled'}
                        >
                            {selectedBooking.bookingStatus === 'cancelled' ? 'Booking Cancelled' : 'Cancel Booking'}
                        </button>
                    </>
                ) : (
                    <>
                        <h2>Your Bookings</h2>
                        <div className="dashboard-tabs">
                            <button className={`tab-btn ${activeTab === 'upcoming' ? 'active' : ''}`} onClick={() => setActiveTab('upcoming')}>Upcoming</button>
                            <button className={`tab-btn ${activeTab === 'history' ? 'active' : ''}`} onClick={() => setActiveTab('history')}>History</button>
                        </div>

                        {activeTab === 'upcoming' && (
                            <section key="upcoming" className="view-enter-active">
                                {upcomingBookings.length > 0 ? (
                                    <ul className="booking-list">
                                        {upcomingBookings.map(renderGuestBookingListItem)}
                                    </ul>
                                ) : (
                                    <p className="no-bookings-message">You have no upcoming bookings.</p>
                                )}
                            </section>
                        )}

                        {activeTab === 'history' && (
                             <section key="history" className="view-enter-active">
                                 <div className="history-filters guest-filters">
                                    <input type="date" name="date" value={historyFilters.date} onChange={handleFilterChange} />
                                    <select name="status" value={historyFilters.status} onChange={handleFilterChange}>
                                        <option value="all">All Statuses</option>
                                        <option value="confirmed">Confirmed</option>
                                        <option value="assigned">Assigned</option>
                                        <option value="cancelled">Cancelled</option>
                                    </select>
                                </div>
                                {pastBookings.length > 0 ? (
                                    <ul className="booking-list">
                                        {pastBookings.map(renderGuestBookingListItem)}
                                    </ul>
                                ) : (
                                    <p className="no-bookings-message">No past bookings match your filters.</p>
                                )}
                            </section>
                        )}
                    </>
                )
            ) : (
                <>
                    <h2>Track Your Booking</h2>
                    <p>Enter the mobile number you used to book to see your ride status.</p>
                    <form className="tracking-form" onSubmit={handleTrackBooking}>
                        <div className="form-group">
                            <label htmlFor="trackingPhone">Mobile Number</label>
                            <input
                                type="tel"
                                id="trackingPhone"
                                value={trackingPhone}
                                onChange={(e) => setTrackingPhone(e.target.value)}
                                placeholder="Enter mobile number"
                                required
                            />
                        </div>
                        {trackingError && <p className="form-error">{trackingError}</p>}
                        <button type="submit" className="primary-btn">Find My Booking</button>
                    </form>
                </>
            )}
        </div>
    );
  };
  

  const renderContent = () => {
    if (isLoading && !isConfirmationVisible) {
      return (
        <div className="status-container">
          <div className="loader"></div>
          <p>Finding the best ride for you...</p>
        </div>
      );
    }
    if (isConfirmationVisible) {
      return renderConfirmation();
    }
    switch (currentUserRole) {
      case 'login':
        return renderLogin();
      case 'admin':
        return <AdminDashboard />;
      case 'driver':
        return <DriverDashboard />;
      case 'guest':
      default:
        if (isTracking) {
            return <GuestBookingStatus />;
        }
        return renderBookingForm();
    }
  };

  return (
    <div className="app-container">
      <div className="notification-container">
          {notifications.map(n => (
              <div key={n.id} className={`notification-item ${n.type}`}>
                  {n.message}
                  <button className="notification-close-btn" onClick={() => setNotifications(prev => prev.filter(item => item.id !== n.id))}>&times;</button>
              </div>
          ))}
      </div>
      <div className="booking-card">
        {currentUserRole !== 'admin' && currentUserRole !== 'driver' && renderHeader()}
        {currentUserRole === 'admin' || currentUserRole === 'driver' ? (
          renderContent()
        ) : (
          <main>{renderContent()}</main>
        )}
      </div>

      {isTermsModalVisible && (
        <div className="modal-overlay" onClick={() => setIsTermsModalVisible(false)}>
            <div className="modal-content" onClick={e => e.stopPropagation()}>
                <h2>Terms and Conditions</h2>
                <div className="modal-scroll-content">
                    <p>
                        <b>Fare Structure:</b>
                        <br />Fares are based on the location and vehicle type, plus 18% GST.
                        <br />- <b>Jabalpur Airport:</b> Base fare of ₹500.
                        <br />- <b>Jabalpur & Madan Mahal Stations:</b> Base fare of ₹250.
                        <br />- <b>Other Locations:</b> Base fares are ₹250 (within 5km) or ₹500 (above 5km).
                        <br />The final estimated fare is calculated on the booking form. SUV rates are higher.
                    </p>
                    <p>
                        <b>General Terms:</b>
                        <br />1. The fare shown is an estimate and may vary based on traffic and other conditions.
                        <br />2. Cancellations made less than 1 hour before pickup time may incur a fee.
                        <br />3. The hotel is not responsible for any items left in the vehicle.
                        <br />4. Please be ready at the scheduled pickup time to avoid delays.
                    </p>
                </div>
                <button className="primary-btn" onClick={() => setIsTermsModalVisible(false)}>
                    I Understand
                </button>
            </div>
        </div>
      )}
    </div>
  );
};

const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement);
root.render(<App />);
