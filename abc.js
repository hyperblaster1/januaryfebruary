import Button from '@kingmakers/material-tailwind-next/Button';
import Typography from '@kingmakers/material-tailwind/Typography';
import { mapPlaySourceToSegmentPlatform } from '@kingmakers/segment/playSourceToPlatform';
import { useLocalization } from '@kingmakers/localization-utils';
import Button from '@kingmakers/material-tailwind-next/Button';
import Typography from '@kingmakers/material-tailwind-next/Typography';
import { mapPlaySourceToSegmentPlatform } from '@kingmakers/segment/playSourceToPlatform';
import { useLoaderData } from '@remix-run/react';
import { useActionData, useLoaderData } from '@remix-run/react';
import { withZod } from '@remix-validated-form/with-zod';
import { useEffect, useState } from 'react';
import { ValidatedForm } from 'remix-validated-form';
import { z as zod } from 'zod';

const validator = withZod(
  zod.object({
    username: zod.string(),
    userId: zod.string(),
    password: zod.string().min(8),
  }),
);

const MAX_ATTEMPTS = 3;
const ALERT_PREFIX = 'alert';
const PASSWORD_FIELD_NAME = 'password';

export const SelfExclusionPassword = () => {
  const userDataParsed = useLoaderData<any>();
  const attemptsLeft = Number(userDataParsed.attemptsLeft);

  const [password, setPassword] = useState<string>('');
  const [showPassword, setShowPassword] = useState<boolean>(false);

  const actionData = useActionData<any>();

  const { locale } = useLocalization();

  const platform = userDataParsed.playSource
    ? mapPlaySourceToSegmentPlatform(userDataParsed.playSource)
    : undefined;

  const timePeriodDisplayMap: Record<string, string> = {
    '3m': '3 months',
    '6m': '6 months',
    '1y': '1 year',
  };

  const breakPeriodDisplay = timePeriodDisplayMap?.[userDataParsed.timePeriod];

  const handleClickShowPassword = () => setShowPassword(prev => !prev);

  const handleSubmit = () => {
    setPassword('');
    setShowPassword(false);
  };

  useEffect(() => {
    if (actionData?.logout) {
      localStorage.removeItem('user');
      window.location.assign('/');
    }
  }, [actionData]);

  const messageId = `${ALERT_PREFIX}-${Date.now()}`;

  return (
    <div className="px-4 flex flex-col bg-common-white flex-1">
      <ValidatedForm validator={validator} method="post" onSubmit={handleSubmit}>
        <Typography variant="h6">Enter your password</Typography>
    
        <input
          name={PASSWORD_FIELD_NAME}
          value={password}
          onChange={e => setPassword(e.target.value)}
        />

        <Button type="submit" color="primary">
          Continue
        </Button>

        <Typography>
          Attempts remaining: {attemptsLeft} / {MAX_ATTEMPTS}
        <Button type="submit">Submit</Button>
        </Typography>

        <Typography>
          Attempts Left: {Math.max(attemptsLeft, 0)} / {MAX_ATTEMPTS}
        </Typography>

        <Typography>{breakPeriodDisplay}</Typography>
      </ValidatedForm>
    </div>
  );
};
