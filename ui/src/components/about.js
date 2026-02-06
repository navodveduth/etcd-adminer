import { Grid, Link } from "@mui/material";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";
import GitHubIcon from "@mui/icons-material/GitHub";

export default function About(props) {
  return (
    <Grid container spacing={3}>
      <Grid
        item
        xs={12}
        sm={12}
        sx={{
          justifyContent: "center",
          display: "flex",
          mt: "10%",
        }}
      >
        <Paper
          sx={{
            p: 2,
            justifyContent: "center",
            alignItems: "center",
            textAlign: "center",
            verticalAlign: "middle",
            maxWidth: 600,
          }}
        >
          <img
            src="/images/logo100.png"
            alt="etcd-logo"
            height="100px"
            width="100px"
          />
          <Typography variant="h2" component="h2">
            ETCD ADMINER
          </Typography>
          <Typography variant="h6" component="h6">
            <Link
              href="https://github.com/navodveduth/etcd-adminer"
              underline="hover"
              target="_blank"
              rel="noopener"
            >
              Admin tool for ETCD
            </Link>
          </Typography>
          <Typography variant="subtitle2" color="text.secondary">
            <GitHubIcon fontSize="20" /> Forked from{" "}
            <Link
              href="https://github.com/srimaln91/etcd-adminer"
              underline="hover"
              target="_blank"
              rel="noopener"
            >
              srimaln91/etcd-adminer
            </Link>
          </Typography>
        </Paper>
      </Grid>
    </Grid>
  );
}
