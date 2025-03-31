import { createStore, applyMiddleware, combineReducers } from 'redux';
import { composeWithDevTools } from 'redux-devtools-extension';
import thunk from 'redux-thunk';
import { carsReducer } from './reducers/carsReducer';
import { alertsReducer } from './reducers/alertsReducer';
import {bookingsReducer} from './reducers/bookingsReducer'
import { usersReducer } from './reducers/usersReducer';
import { driversReducer } from './reducers/driversReducer';
import { feedbackReducer } from './reducers/feedbackReducer';

const composeEnhancers = composeWithDevTools({});

const rootReducer = combineReducers({
        carsReducer,
        alertsReducer,
        bookingsReducer,
        usersReducer,
        driversReducer,
        feedbackReducer,
})
const store = createStore(
    rootReducer,
  composeEnhancers(
    applyMiddleware(thunk)
    
  )
);

export default store