const initialState = {
    loading: false,
    otpSent: false,
    otpVerified: false,
    error: null,
  };
  
  export const otpReducer = (state = initialState, action) => {
    switch (action.type) {
      case 'SEND_OTP_REQUEST':
        return { ...state, loading: true, error: null };
      case 'SEND_OTP_SUCCESS':
        return { ...state, loading: false, otpSent: true };
      case 'SEND_OTP_FAIL':
        return { ...state, loading: false, error: action.payload };
      case 'VERIFY_OTP_REQUEST':
        return { ...state, loading: true, error: null };
      case 'VERIFY_OTP_SUCCESS':
        return { ...state, loading: false, otpVerified: true };
      case 'VERIFY_OTP_FAIL':
        return { ...state, loading: false, error: action.payload };
      default:
        return state;
    }
  };
  