import React, { createContext, useReducer } from 'react';

export const AppContext = createContext();

const initialState = {
  tab: 'today',
  ui: {
    appMode: 'normal',
  },
};

const reducer = (state, action) => {
  switch (action.type) {
    case 'SET_TAB':
      return { ...state, tab: action.payload };
    case 'SET_APP_MODE':
      return { ...state, ui: { ...state.ui, appMode: action.payload } };
    default:
      return state;
  }
};

export const AppProvider = ({ children }) => {
  const [state, dispatch] = useReducer(reducer, initialState);

  return (
    <AppContext.Provider value={{ state, dispatch }}>
      {children}
    </AppContext.Provider>
  );
};
