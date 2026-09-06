import React from 'react';
import { AlertCard } from './EmergencyAlertPanel';

const AlertToast = (props) => {
  return <AlertCard {...props} />;
};

export default React.memo(AlertToast);

